import type { ServerConfig } from './config.js';
import type { ObjectStore } from './types.js';
import { createOssObjectStore } from './oss.js';
import { createS3ObjectStore } from './s3.js';

export function createObjectStore(config: ServerConfig['storage']): ObjectStore {
  return config.provider === 'oss' ? createOssObjectStore(config) : createS3ObjectStore(config);
}
