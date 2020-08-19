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
  get kubeApiConfig() {
    return this._kubeApiConfig;
  }
  get name() {
    return this._resourceMeta.name;
  }
  get singularName() {
    return this._resourceMeta.singularName;
  }
  get namespaced() {
    return this._resourceMeta.namespaced;
  }
  get kind() {
    return this._resourceMeta.kind;
  }
  get verbs() {
    return this._resourceMeta.verbs;
  }
  get kubeApiConfig() {
    return this._kubeApiConfig;
  }

  hasVerb(verb) {
    return this.verbs.some(v => verb == v);
  }


  async request(reqOpt) {
    this._logger.debug(`Request ${reqOpt.method || 'GET'} ${reqOpt.uri || reqOpt.url}`);
    return request(merge(this._kubeApiConfig, reqOpt));
  }

  async get(name, ns, reqOpt = {}) {
    let uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Get ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: true });
    return request.get(merge(this._kubeApiConfig, reqOpt));
  }

  async put(file, reqOpt = {}) {
    let uri = this.uri({ name: objectPath.get(file, 'metadata.name'), namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Put ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: file });
    return request.put(merge(this._kubeApiConfig, reqOpt));
  }

  async post(file, reqOpt = {}) {
    let uri = this.uri({ namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Post ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: file });
    return request.post(merge(this._kubeApiConfig, reqOpt));
  }

  async patch(name, ns, jPatch, reqOpt = {}) {
    let uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`Json Patch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: jPatch });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/json-patch+json');
    let opt = merge(this._kubeApiConfig, reqOpt);
    return request.patch(opt);
  }

  async jsonPatch(name, ns, jPatch, reqOpt = {}) {
    return this.patch(name, ns, jPatch, reqOpt);
  }

  async mergePatch(name, ns, mPatch, reqOpt = {}) {
    let uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`MergePatch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: mPatch });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/merge-patch+json');
    let opt = merge(this._kubeApiConfig, reqOpt);
    return request.patch(opt);
  }

  async strategicMergePatch(name, ns, smPatch, reqOpt = {}) {
    let uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`StrategicMergePatch ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: smPatch });
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/strategic-merge-patch+json');
    let opt = merge(this._kubeApiConfig, reqOpt);
    return request.patch(opt);
  }

  async delete(name, ns, reqOpt = {}) {
    let uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Delete ${uri}`);
    reqOpt = merge(reqOpt, { uri: uri, json: true });
    return request.delete(merge(this._kubeApiConfig, reqOpt));
  }

};
