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
const objectPath = require('object-path');
const RequestLib = require('./request');
const merge = require('deepmerge');

const KubeApiConfig = require('./KubeApiConfig');

module.exports = class KubeResourceMeta {
  constructor(path, rm) {
    this._path = path;
    this._resourceMeta = rm;
    this._extraHeaders = {};

    this._logger = require('./bunyan-api').createLogger('KubeResourceMeta');
  }

  clone() {
    return new KubeResourceMeta(this._path, this._resourceMeta);
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
    return (typeof this._resourceMeta.name === 'string') ? this._resourceMeta.name : '';
  }
  get singularName() {
    return (typeof this._resourceMeta.singularName === 'string') ? this._resourceMeta.singularName : '';
  }
  get namespaced() {
    return (typeof this._resourceMeta.namespaced === 'boolean') ? this._resourceMeta.namespaced : false;
  }
  get kind() {
    return (typeof this._resourceMeta.kind === 'string') ? this._resourceMeta.kind : '';
  }
  get verbs() {
    return Array.isArray(this._resourceMeta.verbs) ? this._resourceMeta.verbs : [];
  }
  get kubeApiConfig() {
    return KubeApiConfig;
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
    return RequestLib.doRequest(merge.all([this.kubeApiConfig(), this._extraHeaders, reqOpt]));
  }

  async get(name, ns, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Get ${uri}`);
    return this.request(merge.all([reqOpt, { uri: uri, json: true, method: 'get' }]));
  }

  async put(file, reqOpt = {}) {
    const uri = this.uri({ name: objectPath.get(file, 'metadata.name'), namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Put ${uri}`);
    return this.request(merge.all([reqOpt, { uri: uri, json: file, method: 'put' }]));
  }

  async post(file, reqOpt = {}) {
    const uri = this.uri({ namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Post ${uri}`);
    return this.request(merge.all([reqOpt, { uri: uri, json: file, method: 'post' }]));
  }

  async patch(name, ns, jPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`Json Patch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: jPatch, method: 'patch' });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/json-patch+json');
    return this.request(reqOpt);
  }

  async jsonPatch(name, ns, jPatch, reqOpt = {}) {
    return this.patch(name, ns, jPatch, reqOpt);
  }

  async mergePatch(name, ns, mPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`MergePatch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: mPatch, method: 'patch' });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/merge-patch+json');
    return this.request(reqOpt);
  }

  async strategicMergePatch(name, ns, smPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`StrategicMergePatch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: smPatch, method: 'patch' });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/strategic-merge-patch+json');
    return this.request(merge.all(reqOpt));
  }

  async delete(name, ns, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Delete ${uri}`);
    return this.request(merge.all([reqOpt, { uri: uri, json: true, method: 'delete' }]));
  }
};
