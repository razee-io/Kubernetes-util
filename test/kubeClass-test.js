/**
 * Copyright 2019 IBM Corp. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const assert = require('chai').assert;
const nock = require('nock');
const deepEqual = require('deep-equal');
const { KubeClass, KubeApiConfig } = require('../index');
KubeApiConfig({ localhost: true });
// const objectPath = require('object-path');

describe('kubeClass', function () {

  describe('#getCoreApis()', () => {
    var kc;

    beforeEach(() => {
      kc = new KubeClass();
    });

    afterEach(() => {
      kc = undefined;
      nock.cleanAll();
    });

    it('#success', async () => {
      nock('http://localhost:8001')
        .get('/api/v1')
        .replyWithFile(200, __dirname + '/replies/coreApis.json', { 'Content-Type': 'application/json' });
      let ca = await kc.getCoreApis();
      assert.isTrue(ca[0].hasVerb('watch'), 'Resource has verb \'watch\'');
      assert.isFalse(ca[0].hasVerb('somersault'), 'Resource does not have verb \'somersault\'');
      assert.strictEqual(ca[0].uri(), '/api/v1/pods', 'Resource URI should be /api/v1/pods');
    });

    it('#error', async () => {
      nock('http://localhost:8001')
        .get('/api/v1')
        .replyWithError('bad things happened man');
      try {
        await kc.getCoreApis();
        assert.fail('#error test should have thrown an error');
      } catch (e) {
        assert.strictEqual(e.message, 'bad things happened man', 'Exception should be the bad response'); // request: RequestError, axios: AxiosError
      }
    });


  });

  describe('#getApis()', () => {
    var kc;

    beforeEach(() => {
      kc = new KubeClass();
    });

    afterEach(() => {
      kc = undefined;
      nock.cleanAll();
    });

    it('#success latest no duplicates', async () => {
      nock('http://localhost:8001')
        .get('/apis')
        .replyWithFile(200, __dirname + '/replies/apiGroups.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1')
        .replyWithFile(200, __dirname + '/replies/apps-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta1')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta2')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta2.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1')
        .replyWithFile(200, __dirname + '/replies/batch-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1beta1')
        .replyWithFile(200, __dirname + '/replies/batch-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v2alpha1')
        .replyWithFile(200, __dirname + '/replies/batch-v2alpha1.json', { 'Content-Type': 'application/json' });

      let apis = await kc.getApis();
      assert.equal(apis.length, 17, 'Should get 17 resource apis');

    });

    it('#success all with duplicates', async () => {
      nock('http://localhost:8001')
        .get('/apis')
        .replyWithFile(200, __dirname + '/replies/apiGroups.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1')
        .replyWithFile(200, __dirname + '/replies/apps-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta1')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta2')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta2.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1')
        .replyWithFile(200, __dirname + '/replies/batch-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1beta1')
        .replyWithFile(200, __dirname + '/replies/batch-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v2alpha1')
        .replyWithFile(200, __dirname + '/replies/batch-v2alpha1.json', { 'Content-Type': 'application/json' });

      let apis = await kc.getApis(true);
      assert.equal(apis.length, 38, 'Should get 38 resource apis');

    });

    it('#success no ApiList', async () => {
      nock('http://localhost:8001')
        .get('/apis')
        .reply(200, {
          'kind': 'APIGroupList',
          'apiVersion': 'v1',
          'groups': [{
            'name': 'batch',
            'versions': [{
              'groupVersion': 'batch/v1',
              'version': 'v1'
            }],
            'preferredVersion': {
              'groupVersion': 'batch/v1',
              'version': 'v1'
            }
          }]
        })
        .get('/apis/batch/v1')
        .reply(200, { kind: 'NotAPIResourceList' });

      let res = await kc.getApis();
      assert.equal(res.length, 0, 'Error should return successfully, but without the failed resource');
    });

    it('#404', async () => {
      nock('http://localhost:8001')
        .get('/apis')
        .replyWithFile(200, __dirname + '/replies/apiGroups.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1')
        .reply(404, { msg: 'not found' })
        .get('/apis/apps/v1beta1')
        .reply(404, { msg: 'not found' })
        .get('/apis/apps/v1beta2')
        .reply(404, { msg: 'not found' })
        .get('/apis/batch/v1')
        .reply(404, { msg: 'not found' })
        .get('/apis/batch/v1beta1')
        .reply(404, { msg: 'not found' })
        .get('/apis/batch/v2alpha1')
        .reply(404, { msg: 'not found' });
      try {
        await kc.getApis();
      } catch (e) {
        assert.deepEqual(e, { statusCode: 404, body: { msg: 'not found' }, message: 'Error getting /apis/batch/v2alpha1' });
      }



    });

    it('#error', async () => {
      nock('http://localhost:8001')
        .get('/apis')
        .replyWithError('bad things happened man');
      try {
        await kc.getApis();
        assert.fail('#error test should have thrown an error');
      } catch (e) {
        assert.strictEqual(e.message, 'bad things happened man', 'Exception should be the bad response'); // request: RequestError, axios: AxiosError
      }
    });

  });

  describe('#getKubeResourcesMeta(verb)', () => {
    var kc;

    beforeEach(() => {
      kc = new KubeClass();
    });

    afterEach(() => {
      kc = undefined;
      nock.cleanAll();
    });

    it('#success', async () => {
      nock('http://localhost:8001')
        .get('/api/v1')
        .replyWithFile(200, __dirname + '/replies/coreApis.json', { 'Content-Type': 'application/json' })
        .get('/apis')
        .replyWithFile(200, __dirname + '/replies/apiGroups.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1')
        .replyWithFile(200, __dirname + '/replies/apps-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta1')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta2')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta2.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1')
        .replyWithFile(200, __dirname + '/replies/batch-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1beta1')
        .replyWithFile(200, __dirname + '/replies/batch-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v2alpha1')
        .replyWithFile(200, __dirname + '/replies/batch-v2alpha1.json', { 'Content-Type': 'application/json' });

      let mr = await kc.getKubeResourcesMeta('watch');
      assert.equal(mr.length, 8, 'Should get 8 MetaResources that support watch');
    });

    it('#success w/out verb', async () => {
      nock('http://localhost:8001')
        .get('/api/v1')
        .replyWithFile(200, __dirname + '/replies/coreApis.json', { 'Content-Type': 'application/json' })
        .get('/apis')
        .replyWithFile(200, __dirname + '/replies/apiGroups.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1')
        .replyWithFile(200, __dirname + '/replies/apps-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta1')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/apps/v1beta2')
        .replyWithFile(200, __dirname + '/replies/apps-v1beta2.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1')
        .replyWithFile(200, __dirname + '/replies/batch-v1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v1beta1')
        .replyWithFile(200, __dirname + '/replies/batch-v1beta1.json', { 'Content-Type': 'application/json' })
        .get('/apis/batch/v2alpha1')
        .replyWithFile(200, __dirname + '/replies/batch-v2alpha1.json', { 'Content-Type': 'application/json' });

      let mr = await kc.getKubeResourcesMeta();
      assert.equal(mr.length, 18, 'Should get 18 MetaResources');

    });

    it('#error', async () => {
      nock('http://localhost:8001')
        .get('/api/v1')
        .replyWithError('bad things happened man');
      nock('http://localhost:8001')
        .get('/apis')
        .replyWithError('other bad things happened man');
      try {
        await kc.getKubeResourcesMeta();
        assert.fail('#error test should have thrown an error');
      } catch (e) {
        assert.strictEqual(e.message, 'bad things happened man', 'Exception should be the bad response'); // request: RequestError, axios: AxiosError
      }
    });

  });

  describe('#getResource()', () => {
    const { KubeResourceMeta } = require('../index');
    var kc;

    beforeEach(() => {
      kc = new KubeClass();
    });

    afterEach(() => {
      kc = undefined;
      nock.cleanAll();
    });

    it('#success', async () => {

      let krm = new KubeResourceMeta('/apis/v1', {
        name: 'deployments',
        singularName: 'deployment',
        namespaced: true,
        kind: 'Deployment',
        'verbs': ['watch']
      });
      let exampleResource = { example: 'resource' };
      let queryObject = { labelSelector: 'app=myapp' };
      let expectedResult = {
        statusCode: 200,
        'resource-metadata': krm,
        object: exampleResource
      };
      nock('http://localhost:8001')
        .get(krm.uri())
        .query((actualQueryObject) => {
          return deepEqual(actualQueryObject, queryObject);
        })
        .reply(200, exampleResource);
      let r = await kc.getResource(krm, queryObject);
      assert.deepEqual(r, expectedResult);
    });

    it('#404', async () => {

      let krm = new KubeResourceMeta('/apis/v1', {
        name: 'deployments',
        singularName: 'deployment',
        namespaced: true,
        kind: 'Deployment',
        'verbs': ['watch']
      });
      let resourceNotFound = { msg: 'Resource not found' };
      let expectedResult = {
        statusCode: 404,
        'resource-metadata': krm,
        error: resourceNotFound
      };
      nock('http://localhost:8001')
        .get(krm.uri())
        .reply(404, resourceNotFound);
      let r = await kc.getResource(krm);
      // console.log(r);
      assert.deepEqual(r, expectedResult);
    });

    it('#undefinedMetadata', async () => {
      let r = await kc.getResource(undefined);
      assert.isUndefined(r, 'api should return undefined when metadata input is undefined');
    });

    it('#error', async () => {
      let krm = new KubeResourceMeta('/apis/v1', {
        name: 'deployments',
        singularName: 'deployment',
        namespaced: true,
        kind: 'Deployment',
        'verbs': ['watch']
      });
      console.log( krm.uri() );
      nock('http://localhost:8001')
        .get(krm.uri())
        .replyWithError('bad things happened man');
      try {
        await kc.getKubeResourcesMeta();
        assert.fail('#error test should have thrown an error');
      } catch (e) {
        assert.include(e.message, 'No match for request', 'Exception should be the nock 404 error'); // request: RequestError, axios: AxiosError
      }
    });
  });

  describe('#getResources()', () => {
    const { KubeResourceMeta } = require('../index');
    var kc;

    beforeEach(() => {
      kc = new KubeClass();
    });

    afterEach(() => {
      kc = undefined;
      nock.cleanAll();
    });

    it('#success', async () => {
      let krm = new KubeResourceMeta('/apis/v1', {
        name: 'deployments',
        singularName: 'deployment',
        namespaced: true,
        kind: 'Deployment',
        'verbs': ['watch']
      });
      let exampleResource = { example: 'resource' };
      let queryObject = { labelSelector: 'app=myapp' };
      let expectedResult = [{
        statusCode: 200,
        'resource-metadata': krm,
        object: exampleResource
      }];
      nock('http://localhost:8001')
        .get(krm.uri())
        .query((actualQueryObject) => {
          return deepEqual(actualQueryObject, queryObject);
        })
        .reply(200, exampleResource);
      let r = await kc.getResources([krm], queryObject);
      assert.deepEqual(r, expectedResult);
    });
  });

  describe('#getResourcesPaged()', () => {
    const { KubeResourceMeta } = require('../index');
    var kc;

    beforeEach(() => {
      kc = new KubeClass();
    });

    afterEach(() => {
      kc = undefined;
      nock.cleanAll();
    });

    it('#success - no limit, no next', async () => {

      let krm = new KubeResourceMeta('/apis/v1', {
        name: 'deployments',
        singularName: 'deployment',
        namespaced: true,
        kind: 'Deployment',
        'verbs': ['watch']
      });
      let exampleResource = { example: 'resource' };
      let queryObject = { labelSelector: 'app=myapp' };
      let expectedResult = [{
        statusCode: 200,
        'resource-metadata': krm,
        object: exampleResource
      }];
      nock('http://localhost:8001')
        .get(krm.uri())
        .query((actualQueryObject) => {
          return deepEqual(actualQueryObject, queryObject);
        })
        .reply(200, exampleResource);
      let r = await kc.getResourcesPaged([krm], queryObject);
      assert.deepEqual(r.resources, expectedResult);
    });

    it('#success - with limit, next', async () => {

      let krm = new KubeResourceMeta('/apis/v1', {
        name: 'deployments',
        singularName: 'deployment',
        namespaced: true,
        kind: 'Deployment',
        'verbs': ['watch']
      });
      let exampleResource = {
        example: 'resource',
        metadata: {
          selfLink: '/api/v1/endpoints',
          resourceVersion: '12780413'
        },
      };
      let queryObject = { labelSelector: 'app=myapp', limit: 1 };
      let expectedResult = [{
        statusCode: 200,
        'resource-metadata': krm,
        object: exampleResource
      }];
      nock('http://localhost:8001')
        .get(krm.uri())
        .query((actualQueryObject) => {
          return deepEqual(actualQueryObject, queryObject);
        })
        .reply(200, exampleResource);
      let next = { continue: {}, idx: 0 };
      let r = await kc.getResourcesPaged([krm], queryObject, next);
      assert.deepEqual(r.resources, expectedResult);
    });
  });
});
