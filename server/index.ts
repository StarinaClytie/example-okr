import { config as loadDotEnv } from 'dotenv';
import { createApp } from './app.js';
import { createDatabaseGateway } from './auth.js';
import { loadServerConfig } from './config.js';
import { createObjectStore } from './objectStore.js';

loadDotEnv({ path: process.env.ATTACHMENT_ENV_FILE || '.env.production.local', override: false });
const config = loadServerConfig(process.env);
const database = createDatabaseGateway(config);
const app = createApp({ ...database, store: createObjectStore(config.storage) }, config.rateLimit);
app.listen(config.port, config.host, () => {
  console.info(`Attachment API listening on http://${config.host}:${config.port}`);
});
