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
const axios = require('axios');
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
    /*
    KubeResourceMeta `request/get/put/post/patch/*Patch/delete` methods take a reqOpt object as an argument.
    The object is expected to be of the `request` library format, see https://github.com/request/request#requestoptions-callback
    However the `request` library is not used here as it is deprecated and may contain security vulnerabilities.
    Instead these parameters are recognized and converted into the corresponding parameters for the library that is actually used (axios):
    - baseUrl -> baseURL
    - uri -> url
    - body -> data
    - method (no change)
    - headers (no change)
    - if `simple` is false, promise rejection is returned only for 'technical errors', not based on the response status code (default true)
    The response is similarly converted from `axios` format to `request` format:
    - data -> body
    - status -> statusCode
    - statusText -> statusMessage
    - if `resolveWithFullVersion` is false, return only the body (default false)
    Response attributes other than `body/statusCode/statusMessage` are omitted.
    */
    const allowedReqOptions = [
      'baseUrl',
      'uri',
      'body',
      'simple',
      'resolveWithFullVersion',
      'method',
      'headers'
    ];
    const invalidRequestOptions = Object.getOwnPropertyNames(options.requestOptions ?? {}).filter( n => !allowedReqOptions.includes(n) );
    if( invalidRequestOptions.length > 0 ) {
      throw `KubeResourceMeta invalid request options: ${invalidRequestOptions.join(',')}.`;
    }
    
    // Convert key reqOpt properties from `request` format to `axios` format
    const axiosOptions = merge.all([ this.kubeApiConfig(), this._extraHeaders, reqOpt, { baseURL: reqOpt.baseUrl, url: reqOpt.uri, data: reqOpt.body ]}); // request: baseUrl/uri/body, axios: baseURL/url/data
    delete axiosOptions.uri;
    delete axiosOptions.baseUrl;
    delete axiosOptions.body;
    delete axiosOptions.simple;
    delete axiosOptions.resolveWithFullVersion;

    if( reqOpt.simple === false ) {
      axiosOptions.validateStatus = null; // Return without error regardless of the http response code
    }
    
    this._logger.debug(`Request ${axiosOptions.method || 'GET'} ${axiosOptions.url}`);
    const result = await axios(axiosOptions);
    
    if( !reqOpt.resolveWithFullResponse ) {
      return result.body;
    }
    // Convert from `axios` response object to `response` format response object
    return { body: result.data, statusCode: result.status, statusMessage: result.statusText };
  }

  async get(name, ns, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Get ${uri}`);
    return this.request(merge.all([reqOpt, { uri, method: 'get' }]));
  }

  async put(file, reqOpt = {}) {
    const uri = this.uri({ name: objectPath.get(file, 'metadata.name'), namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Put ${uri}`);
    return this.request(merge.all([reqOpt, { uri, method: 'put' }]));
  }

  async post(file, reqOpt = {}) {
    const uri = this.uri({ namespace: objectPath.get(file, 'metadata.namespace') });
    this._logger.debug(`Post ${uri}`);
    return this.request(merge.all([reqOpt, { uri, method: 'post' }]));
  }

  async patch(name, ns, jPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`Json Patch ${uri}`);
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/json-patch+json');
    return this.request(merge.all([reqOpt, { uri, method: 'patch', data: jPatch }]));
  }

  async jsonPatch(name, ns, jPatch, reqOpt = {}) {
    return this.patch(name, ns, jPatch, reqOpt);
  }

  async mergePatch(name, ns, mPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`MergePatch ${uri}`);
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/merge-patch+json');
    return this.request(merge.all([reqOpt, { uri, method: 'patch', data: mPatch }]));
  }

  async strategicMergePatch(name, ns, smPatch, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns, status: reqOpt.status });
    this._logger.debug(`StrategicMergePatch ${uri}`);
    objectPath.set(reqOpt, ['headers', 'content-type'], objectPath.get(reqOpt, ['headers', 'content-type']) || 'application/strategic-merge-patch+json');
    return this.request(merge.all([reqOpt, { uri, method: 'patch', data: smPatch }]));
  }

  async delete(name, ns, reqOpt = {}) {
    const uri = this.uri({ name: name, namespace: ns });
    this._logger.debug(`Delete ${uri}`);
    return this.request(merge.all([reqOpt, { uri, method: 'delete' }]));
  }

};
