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
const packagejson = require('../package.json');
const fs = require('fs-extra');
const k8s = require('@kubernetes/client-node');
const kc = new k8s.KubeConfig();


const _kubeApiConfig = {};

module.exports = function kubeApiConfig(options = {}) {
  const result = {};
  const refreshTimestamp = _kubeApiConfig?.refreshTimestamp ?? 0;
  const refreshInterval = parseInt(process.env.KUBECONFIG_REFRESH_INTERVAL ?? options.refreshInterval) || 300000; // refresh kubeconfig in refreshInterval or 5 minutes if not defined. matches the default cycle interval.

  // if kubeconfig is deinfed and refresh cache not requested and we havent hit the refreshTimestamp, then return cached kubeconfig
  if (_kubeApiConfig.kubeConfig && options.refreshCache !== true && Date.now() < refreshTimestamp) {
    return _kubeApiConfig.kubeConfig;
  }

  // ===== Kubernetes-Client/Javascript  =====
  let kubeconfigPath = options.kubeConfigPath;

  if (options.localhost) {
    _kubeApiConfig.kubeConfig = { baseUrl: `http://localhost:${options.port || 8001}` };
    _kubeApiConfig.refreshTimestamp = Date.now() + refreshInterval;
    return _kubeApiConfig.kubeConfig;
  } else if (typeof kubeconfigPath === 'string' && fs.existsSync(kubeconfigPath)) {
    kc.loadFromFile(kubeconfigPath);
  } else {
    // First tries to load from process.env.KUBECONFIG, then from $HOME/.kube/config, then finally loadFromCluster
    kc.loadFromDefault();
    kubeconfigPath = (typeof process.env.KUBECONFIG === 'string' && fs.existsSync(process.env.KUBECONFIG)) ? process.env.KUBECONFIG : undefined;
  }

  const cluster = kc.getCurrentCluster();
  const user = kc.getCurrentUser();

  if (cluster.caFile) {
    let path = (cluster.caFile.startsWith('/') || !kubeconfigPath) ? cluster.caFile : `${kubeconfigPath}/${cluster.caFile}`;
    result.ca = fs.readFileSync(path, { encoding: 'utf8' });
  } else if (cluster.caData || user['certificate-authority-data']) {
    result.ca = base64Decode(cluster.caData || user['certificate-authority-data']);
  }
  if (user.certFile) {
    let path = (user.certFile.startsWith('/') || !kubeconfigPath) ? user.certFile : `${kubeconfigPath}/${user.certFile}`;
    result.cert = fs.readFileSync(path, { encoding: 'utf8' });
  } else if (user.certData || user['client-certificate-data']) {
    result.cert = base64Decode(user.certData || user['client-certificate-data']);
  }
  if (user.keyFile) {
    let path = (user.keyFile.startsWith('/') || !kubeconfigPath) ? user.keyFile : `${kubeconfigPath}/${user.keyFile}`;
    result.key = fs.readFileSync(path, { encoding: 'utf8' });
  } else if (user.keyData || user['client-key-data']) {
    result.key = base64Decode(user.keyData || user['client-key-data']);
  }
  if (user.authProvider) {
    let tokenFilePath = user?.authProvider?.config?.tokenFile;
    if (tokenFilePath) {
      result.headers = { 'Authorization': `Bearer ${fs.readFileSync(tokenFilePath, { encoding: 'utf8' })}` };
    } else {
      let idToken = user?.authProvider?.config?.['id-token'];
      result.headers = { 'Authorization': `Bearer ${idToken}` };
    }
  } else if (user.token) {
    result.headers = { 'Authorization': `Bearer ${user.token}` };
  }
  result.baseUrl = cluster.server;

  const userAgentName = process.env.USER_AGENT_NAME || 'razee-io/kubernetes-util';
  const userAgentVersion = process.env.USER_AGENT_VERSION || packagejson.version;

  result.headers = { ...result.headers, 'User-Agent': `${userAgentName}/${userAgentVersion}` };

  _kubeApiConfig.kubeConfig = result;
  _kubeApiConfig.refreshTimestamp = Date.now() + refreshInterval; // refresh in refreshInterval or 5 minutes if not defined
  return result;
};

function base64Decode(o) {
  return Buffer.from(o, 'base64').toString('utf8');
}
