import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createKeyring } from './keyring.js';
import { createChainListener } from './services/chainListener.js';

const config = loadConfig();
const app = createApp(config);
const listener =
  config.rpcUrl !== undefined &&
  config.registryAddress !== undefined &&
  config.walletPass !== undefined
    ? createChainListener(
        {
          rpcUrl: config.rpcUrl,
          chainId: config.chainId,
          registryAddress: config.registryAddress,
          ...(config.listenerStartingBlock === undefined
            ? {}
            : {startingBlock: config.listenerStartingBlock}),
          confirmations: config.listenerConfirmations,
          pollingIntervalMs: config.listenerPollingIntervalMs,
        },
        {
          keyring: createKeyring({
            walletPass: config.walletPass,
            secretsEncPath: config.secretsEncPath,
            keyName: 'veyra-root',
          }),
          agentConfig: {agentApiUrl: config.agentApiUrl},
        },
      )
    : undefined;

const server = app.listen(config.port, () => {
  listener?.start();
  console.log(`Veyra backend listening on port ${config.port}`);
});

function shutdown(): void {
  listener?.stop();
  server.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
