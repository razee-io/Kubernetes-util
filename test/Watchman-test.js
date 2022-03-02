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
const watchman = require('../lib/Watchman');
const log = require('../lib/bunyan-api').createLogger('Watchman-test');

const dummyOptions = { rewatchOnTimeout: false, requestOptions: { baseUrl: 'https://localhost:32263', uri: '/api/v1/watch/namespaces/default/services/kubernetes' } };
const data1 = { 'type': 'ADDED', 'object': { 'kind': 'Service', 'apiVersion': 'v1', 'metadata': { 'name': 'kubernetes', 'namespace': 'default', 'selfLink': '/api/v1/namespaces/default/services/kubernetes', 'uid': '7c75c135-fca7-11e8-9f10-3a7d3a0f8cf2', 'resourceVersion': '14840391', 'creationTimestamp': '2018-12-10T18:14:51Z', 'labels': { 'component': 'apiserver', 'provider': 'kubernetes', 'razee/watch-resource': 'lite' } }, 'spec': { 'ports': [{ 'name': 'https', 'protocol': 'TCP', 'port': 443, 'targetPort': 2040 }], 'clusterIP': '172.21.0.1', 'type': 'ClusterIP', 'sessionAffinity': 'None' }, 'status': { 'loadBalancer': {} } } };

let mockObjectHandler = (data) => { }; // eslint-disable-line no-unused-vars

describe('watchman', () => {

  describe('#constructor', () => {
    it('success', () => {
      let errorsHappen = false;
      try {
        var wm = new watchman(dummyOptions, mockObjectHandler); // eslint-disable-line no-unused-vars
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.isFalse(errorsHappen);
      }
    });
    it('bad objecthandler', () => {
      let errorsHappen = false;
      try {
        var wm = new watchman(dummyOptions, ''); // eslint-disable-line no-unused-vars
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, 'Watchman objectHandler must be a function.');
      } finally {
        assert.isTrue(errorsHappen);
      }
    });
    it('bad uri', () => {
      let errorsHappen = false;
      try {
        var wm = new watchman('', mockObjectHandler); // eslint-disable-line no-unused-vars
      } catch (err) {
        assert.equal(err, 'uri \'undefinedundefined\' not valid watch uri.');
        errorsHappen = true;
      }
      assert.isTrue(errorsHappen);
    });
    it('bad logger', () => {
      let errorsHappen = false;
      try {
        let options = dummyOptions;
        options.logger = 'notanobject';
        var wm = new watchman(options, mockObjectHandler); // eslint-disable-line no-unused-vars
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, 'options.logger must be an object.');
      } finally {
        assert.isTrue(errorsHappen);
      }
    });
  });
  describe('#selfLink', () => {
    it('success', () => {
      let errorsHappen = false;
      try {
        let options = dummyOptions;
        options.logger = { fakeLogger: true };
        var wm = new watchman(options, mockObjectHandler);
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.equal(wm.selfLink, '/api/v1/watch/namespaces/default/services/kubernetes');
        assert.isFalse(errorsHappen);
      }

    });
  });
  describe('#logger', () => {
    it('success', () => {
      let errorsHappen = false;
      try {
        let options = dummyOptions;
        options.logger = { fakeLogger: true };
        var wm = new watchman(dummyOptions, mockObjectHandler);
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {

        assert.deepEqual(wm.logger, { fakeLogger: true });
        assert.isFalse(errorsHappen);
      }
    });
  });
  describe('#objectHandler', () => {
    it('success', () => {
      let errorsHappen = false;
      try {
        var wm = new watchman(dummyOptions, mockObjectHandler);
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.equal(wm.objectHandler, mockObjectHandler);
        assert.isFalse(errorsHappen);
      }
    });
  });
  describe('#watching', () => {
    it('success', () => {
      let errorsHappen = false;
      try {
        var wm = new watchman(dummyOptions, mockObjectHandler);
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.isFalse(wm.watching);
        assert.isFalse(errorsHappen);
      }
    });
  });
  describe('#watch', () => {
    it('success', (done) => {
      let dummyLogger = {
        debug: (msg) => {
          log.debug('dummyLogger', msg);
        },
        info: (msg) => {
          log.info('dummyLogger', msg);
        },
        error: (msg) => {
          log.error('dummyLogger', msg);
        }
      };
      let xmockObjectHandler = (data) => {
        assert.deepEqual(data, data1);
        done();
      };
      let myOptions = dummyOptions;
      myOptions.logger = dummyLogger;
      nock('https://localhost:32263')
        .get('/api/v1/watch/namespaces/default/services/kubernetes')
        .reply(200, data1);
      let errorsHappen = false;
      try {
        var wm = new watchman(myOptions, xmockObjectHandler);
        wm.watch();
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.isFalse(wm.watching);
        assert.isFalse(errorsHappen);
      }
    });

    it('end', (done) => {
      let xmockObjectHandler = (data) => { // eslint-disable-line no-unused-vars
        assert.fail('should not get here');
      };
      nock('https://localhost:32263')
        .get('/api/v1/namespaces/default/services/kubernetes')
        .reply(200, data1);
      let errorsHappen = false;
      try {
        var wm = new watchman(dummyOptions, xmockObjectHandler);
        wm.watch();
        wm.end();
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.isFalse(wm.watching);
        assert.isFalse(errorsHappen);
        done();
      }
    });

    it('errorResponse', (done) => {
      let wm;
      let dummyLogger = {
        debug: (msg) => {
          log.debug('dummyLogger', msg);
        },
        info: (msg) => {
          log.info('dummyLogger', msg);
        },
        error: (msg) => {
          assert.equal(msg, 'GET /api/v1/watch/namespaces/default/services/kubernetes returned 201');
          wm.end();
        }
      };
      let myOptions = dummyOptions;
      myOptions.logger = dummyLogger;
      myOptions.requestOptions.baseUrl = 'https://localhost:666';
      myOptions.rewatchOnTimeout = false;
      let xmockObjectHandler = (data) => {
        log.info('xmockObjectHandler', data);
      };
      nock('https://localhost:666')
        .get('/api/v1/watch/namespaces/default/services/kubernetes')
        .reply(201);
      let errorsHappen = false;
      try {
        wm = new watchman(myOptions, xmockObjectHandler);
        wm.watch();
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.isFalse(wm.watching);
        assert.isFalse(errorsHappen);
        done();
      }
    });

    it('errorstream', (done) => {
      let wm;
      let dummyLogger = {
        debug: (msg) => {
          log.debug('dummyLogger', msg);
        },
        info: (msg) => {
          log.info('dummyLogger', msg);
        },
        error: (msg) => {
          assert.equal(msg, 'GET /api/v1/watch/namespaces/default/services/kubernetes errored');
          wm.end();
          done();
        }
      };
      let myOptions = dummyOptions;
      myOptions.logger = dummyLogger;
      myOptions.requestOptions.baseUrl = 'https://localhost:666';
      myOptions.rewatchOnTimeout = false;
      let xmockObjectHandler = (data) => {
        log.info('xmockObjectHandler', data);
      };
      nock('https://localhost:666')
        .get('/api/v1/watch/namespaces/default/services/kubernetes')
        .replyWithError('test errorstream error');
      let errorsHappen = false;
      try {
        wm = new watchman(myOptions, xmockObjectHandler);
        wm.watch();
      } catch (err) {
        errorsHappen = true;
        assert.equal(err, '');
      } finally {
        assert.isFalse(wm.watching);
        assert.isFalse(errorsHappen);
      }
    });
  });
});
