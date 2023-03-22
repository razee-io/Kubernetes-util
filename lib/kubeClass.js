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
const axios = require('axios');
const https = require('https');
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
    const axiosOptions = merge({ headers: { Accept: 'application/json' } }, KubeApiConfig());
    // KubeApiConfig can include ca, cert, key attributes.  request recognizes these automatically (though undocumented), axios needs an httpsAgent
    if( axiosOptions.ca && axiosOptions.key && axiosOptions.cert ) {
      axiosOptions.httpsAgent = new https.Agent({
        cert: axiosOptions.cert,
        key: axiosOptions.key,
        ca: axiosOptions.ca,
      });
    }
    return axiosOptions;
  }

  async getCoreApis() {
    let coreApiList = await axios.get('/api/v1', this._baseOptions);
    if (coreApiList.status !== 200) {
      return Promise.reject({ statusCode: coreApiList.status, body: coreApiList.data, message: 'Error getting /api/v1' });
    }
    let apiResourceList = coreApiList.data;
    let resourceMetaList = apiResourceList.resources;
    let result = resourceMetaList.map(r => new KubeResourceMeta(`/api/${apiResourceList.groupVersion}`, r));
    return result;
  }


  async getApis(getAll = false) {
    let apiQuery = await axios.get('/apis', this._baseOptions);
    if (apiQuery.status !== 200) {
      return Promise.reject({ statusCode: apiQuery.status, body: apiQuery.data, message: 'Error getting /apis' });
    }
    let apisGroups = apiQuery.data;
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
    let response = await axios.get('/apis/' + groupVersion, this._baseOptions);
    if (response.status == 200 && objectPath.get(response, 'data.kind') === 'APIResourceList') {
      let resources = objectPath.get(response, 'data.resources');
      resources.map((r) => {
        let krm = new KubeResourceMeta(`/apis/${groupVersion}`, r);
        krmHandler(krm);
      });
      return { statusCode: response.status, groupVersion: groupVersion };
    } else {
      return Promise.reject({ statusCode: response.status, body: response.data, message: `Error getting /apis/${groupVersion}` });
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
    let options = merge({ params: queryParams, validateStatus: null }, this._baseOptions);  // request: qs, axios params.  axios validateStatus to always resolve
    let response = await axios.get(resourceMeta.uri(), options);
    result.statusCode = response.status;  // request: statusCode, axios: status
    switch (response.status) {
      case 200:
        result.object = this.injectSelfLink(response.data, resourceMeta);
        break;
      default:
        // this.logger.error(`this.getResource ${uri} ${response.status} ${status[response.status]}.`, response.data);
        result.error = response.data;
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
      let response = await axios.get('/apis/apiextensions.k8s.io/v1/customresourcedefinitions', this._baseOptions);
      if (response.status == 200 && objectPath.get(response, 'data.kind') === 'CustomResourceDefinitionList') { // response: statusCode/body, axios: status/data
        objectPath.get(response, 'data.items', []).map(crd => {
          crdsHash[`/apis/${objectPath.get(crd, 'spec.group')}`] = true;
        });
        crds = Object.keys(crdsHash);
      } else {
        throw response.data;
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
