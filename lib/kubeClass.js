/**
 * Copyright 2019, 2023 IBM Corp. All Rights Reserved.
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
const RequestLib = require('@razee-io/request-util');
const merge = require('deepmerge');
const clone = require('clone');
const objectPath = require('object-path');

const KubeResourceMeta = require('./KubeResourceMeta');
const KubeApiConfig = require('./KubeApiConfig');

const kubeResourceMetaCache = {};

module.exports = class KubeClass {

  constructor(logger) {
    this._log = logger || require('./bunyan-api').createLogger('kubeClass');
  }

  get _baseOptions() {
    // need to re-compute base options every call in case KubeApiConfig needs to get a fresh token
    return merge({
      headers: {
        Accept: 'application/json'
      },
      json: true,
      simple: false,
      resolveWithFullResponse: true
    }, KubeApiConfig());
  }

  async getCoreApis() {
    let coreApiList = await RequestLib.doRequest(merge(this._baseOptions, {uri: '/api/v1', method: 'get'}), this._log);
    if (coreApiList.statusCode !== 200) {
      return Promise.reject({ statusCode: coreApiList.statusCode, body: coreApiList.body, message: 'Error getting /api/v1' });
    }
    let apiResourceList = coreApiList.body;
    let resourceMetaList = apiResourceList.resources;
    let result = resourceMetaList.map(r => new KubeResourceMeta(`/api/${apiResourceList.groupVersion}`, r));
    return result;
  }


  async getApis(getAll = false) {
    let apiQuery = await RequestLib.doRequest(merge(this._baseOptions, {uri: '/apis', method: 'get'}), this._log);
    if (apiQuery.statusCode !== 200) {
      return Promise.reject({ statusCode: apiQuery.statusCode, body: apiQuery.body, message: 'Error getting /apis' });
    }
    let apisGroups = apiQuery.body;
    let apiList = await Promise.all(apisGroups.groups.map(async (group) => {
      let result = [];
      if (getAll) {
        result = await this.getApisAll(group);
      } else {
        result = await this.getApisLatest(group);
      }
      return result;
    }));
    apiList = apiList.flat();
    apiList = apiList.filter(api => api !== undefined);
    return apiList;
  }

  async getApisAll(group) {
    let result = [];
    await Promise.all(objectPath.get(group, 'versions', []).map(async v => {
      try {
        await this.getApisSingle(v.groupVersion, (krm) => result.push(krm));
      } catch (e) {
        this._log.warn(e);
      }
      return;
    }));
    return result;
  }

  async getApisLatest(group) {
    let versions = objectPath.get(group, 'versions', []);
    let preferredGroupVersion = objectPath.get(group, 'preferredVersion.groupVersion');
    let latest = {};
    for (var i = versions.length - 1; i > -1; i--) {
      let v = versions[i];
      if (v.groupVersion !== preferredGroupVersion) {
        try {
          await this.getApisSingle(v.groupVersion, (krm) => latest[krm.name] = krm);
        } catch (e) {
          this._log.warn(e);
        }
      }
    }
    try {
      await this.getApisSingle(preferredGroupVersion, (krm) => latest[krm.name] = krm);
    } catch (e) {
      this._log.warn(e);
    }

    return Object.values(latest);
  }

  async getApisSingle(groupVersion, krmHandler) {
    let response = await RequestLib.doRequest(merge(this._baseOptions, {uri: '/apis/' + groupVersion, method: 'get'}), this._log);
    if (response.statusCode == 200 && objectPath.get(response, 'body.kind') === 'APIResourceList') {
      let resources = objectPath.get(response, 'body.resources');
      resources.map((r) => {
        let krm = new KubeResourceMeta(`/apis/${groupVersion}`, r);
        krmHandler(krm);
      });
      return { statusCode: response.statusCode, groupVersion: groupVersion };
    } else {
      return Promise.reject({ statusCode: response.statusCode, body: response.body, message: `Error getting /apis/${groupVersion}` });
    }
  }


  injectSelfLink(object, resourceMeta) {
    let resources = objectPath.get(object, 'items', []);
    resources.forEach(r => {
      let metadata = { name: objectPath.get(r, 'metadata.name'), namespace: objectPath.get(r, 'metadata.namespace') };
      objectPath.set(r, 'metadata.annotations.selfLink', resourceMeta.uri(metadata));
    });
    return object;
  }

  async getResource(resourceMeta, queryParams = {}) {
    let result;
    if (!resourceMeta) {
      return result;
    }
    result = {
      'resource-metadata': resourceMeta
    };
    let options = merge({ qs: queryParams }, this._baseOptions);
    let response = await RequestLib.doRequest(merge(options, {uri: resourceMeta.uri(), method: 'get'}), this._log);
    result.statusCode = response.statusCode;
    switch (response.statusCode) {
      case 200:
        result.object = this.injectSelfLink(response.body, resourceMeta);
        break;
      default:
        // this._log.error(`kubeClass.getResource ${uri} ${response.statusCode} ${status[response.statusCode]}.`, response.body);
        result.error = response.body;
    }
    return result;
  }


  async getResources(resourcesMeta, queryParams) {
    let result = await Promise.all(resourcesMeta.map(async (resourceMeta) => {
      return await this.getResource(resourceMeta, queryParams);
    }));
    return result;
  }


  async getResourcesPaged(resourcesMeta, queryParams = {}, next = undefined) {
    let result = {};
    if (queryParams.limit === undefined && next === undefined) {
      let resources = await this.getResources(resourcesMeta, queryParams);
      result.resources = resources;
    } else {
      next = next || { idx: 0 };
      queryParams = clone(queryParams, false);
      queryParams.continue = next.continue;
      let resource = await this.getResource(resourcesMeta[next.idx], queryParams);
      // console.dir(resource,{depth:null});
      if (resource.statusCode === 200) {
        next.continue = resource.object.metadata.continue; // eslint-disable-line require-atomic-updates
      }
      result.resources = [resource];
      if (!next.continue || next.continue === '') {
        next.idx++;
      }
      if (next.idx < resourcesMeta.length) {
        result.next = next;
      }
    }
    return result;
  }


  async getKubeResourcesMeta(verb) {
    var [core, apis] = await Promise.all([this.getCoreApis(), this.getApis(false)]);

    let crds = [];
    try {
      const crdsHash = {};
      let response = await RequestLib.doRequest(merge(this._baseOptions, {uri: '/apis/apiextensions.k8s.io/v1/customresourcedefinitions', method: 'get'}), this._log);
      if (response.statusCode == 200 && objectPath.get(response, 'body.kind') === 'CustomResourceDefinitionList') {
        objectPath.get(response, 'body.items', []).map(crd => {
          crdsHash[`/apis/${objectPath.get(crd, 'spec.group')}`] = true;
        });
        crds = Object.keys(crdsHash);
      } else {
        throw response.body;
      }
    } catch (e) {
      this._log.warn(e, 'Could not list crds, if there are duplicated plural names, the returned kubeResourceMeta list will be incomplete.');
    }

    const apisNameHash = {};
    const crdApis = [];
    apis.map((api) => {
      const includes = (el) => api.path.startsWith(el);
      if (crds.some(includes)) {
        crdApis.push(api);
      } else if (apisNameHash[api.name] === undefined || apisNameHash[api.name].uri().startsWith('/apis/extensions/')) {
        apisNameHash[api.name] = api;
      }
    });
    apis = Object.values(apisNameHash);

    var result = core.concat(apis, crdApis);
    if (verb) {
      result = result.filter(r => r.hasVerb(verb));
    }
    return result;
  }


  // New methods ... need to decide to keep here or not

  async cacheKubeResourceMeta() {
    var [core, apis] = await Promise.all([this.getCoreApis(), this.getApis(true)]);
    var result = core.concat(apis);
    result = result.filter(r => !(r.name.includes('/')));
    result.map(krm => {
      objectPath.set(kubeResourceMetaCache, [krm.path, krm.kind], krm);
    });
  }

  async getKubeResourceMeta(apiVersion, kind, verb) {
    let path = apiVersion == 'v1' ? '/api/v1' : `/apis/${apiVersion}`;
    let krm = objectPath.get(kubeResourceMetaCache, [path, kind]);
    if (!krm) {
      // TODO: add ttl on cache
      await this.cacheKubeResourceMeta();
      krm = objectPath.get(kubeResourceMetaCache, [path, kind]);
    }
    if (verb && krm && !krm.hasVerb(verb)) {
      krm = undefined;
    }
    return krm !== undefined ? krm.clone() : krm;
  }

};