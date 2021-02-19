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
const objectPath = require('object-path');
const request = require('request-promise-native');
const merge = require('deepmerge');

module.exports = class KubeResourceMeta {
  constructor(path, rm, kubeApiConfig) {
    this._path = path;
    this._resourceMeta = rm;
    this._kubeApiConfig = kubeApiConfig;
    this._extraHeaders = {};

    this._logger = require('./bunyan-api').createLogger('KubeResourceMeta');
  }

  uri(options = {}) {
    let result = `${this._path}`;
    if (options.watch) {
      result = `${result}/watch`;
    }
    if (options.namespace && this.namespaced) {
      result = `${result}/namespaces/${options.namespace}`;
    }
    result = `${result}/${this._resourceMeta.name}`;
    if (options.name) {
      result = `${result}/${options.name}`;
    }
    if (options.status) {
      result = `${result}/status`;
    } else if (options.scale) {
      result = `${result}/scale`;
    }
    return result;
  }
  get path() {
    return this._path;
  }
  get resourceMeta() {
    return this._resourceMeta;
  }
  get name() {
    return this._resourceMeta.name || '';
  }
  get singularName() {
    return this._resourceMeta.singularName || '';
  }
  get namespaced() {
    return this._resourceMeta.namespaced || false;
  }
  get kind() {
    return this._resourceMeta.kind || '';
  }
  get verbs() {
    return this._resourceMeta.verbs || [];
  }
  get kubeApiConfig() {
    return this._kubeApiConfig;
  }
  get extraHeaders() {
    return this._extraHeaders;
  }

  hasVerb(verb) {
    return this.verbs.some(v => verb == v);
  }
  addHeader(key, value) {
    objectPath.set(this._extraHeaders, ['headers', key], value);
  }
  removeHeader(key) {
    objectPath.del(this._extraHeaders, ['headers', key]);
    if (Object.keys(objectPath.get(this._extraHeaders, 'headers', {})).length === 0) {
      objectPath.del(this._extraHeaders, 'headers');
    }
  }


  async request(reqOpt) {
    this._logger.debug(`Request ${reqOpt.method || 'GET'} ${reqOpt.uri || reqOpt.url}`);
    return request(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt]));
  }

  async get(name, ns, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Get ${uri}`);
    return request.get(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt, { uri: uri, json: true }]));
  }

  async put(file, reqOpt = {}) {
    const uri = this.uri({ name: objectPath.get(file, 'metadata.name'), namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Put ${uri}`);
    return request.put(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt, { uri: uri, json: file }]));
  }

  async post(file, reqOpt = {}) {
    const uri = this.uri({ namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Post ${uri}`);
    return request.post(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt, { uri: uri, json: file }]));
  }

  async patch(name, ns, jPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`Json Patch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: jPatch });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/json-patch+json');
    return request.patch(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt]));
  }

  async jsonPatch(name, ns, jPatch, reqOpt = {}) {
    return this.patch(name, ns, jPatch, reqOpt);
  }

  async mergePatch(name, ns, mPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`MergePatch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: mPatch });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/merge-patch+json');
    return request.patch(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt]));
  }

  async strategicMergePatch(name, ns, smPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`StrategicMergePatch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: smPatch });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/strategic-merge-patch+json');
    return request.patch(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt]));
  }

  async delete(name, ns, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Delete ${uri}`);
    return request.delete(merge.all([this._kubeApiConfig, this._extraHeaders, reqOpt, { uri: uri, json: true }]));
  }

};
