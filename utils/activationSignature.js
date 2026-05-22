const crypto = require('crypto');
const fs = require('fs');

const PRIVATE_KEY_ENV_NAME = 'RSA_PRIVATE_KEY';
const PRIVATE_KEY_PATH_ENV_NAME = 'RSA_PRIVATE_KEY_PATH';
const PUBLIC_KEY_ENV_NAME = 'RSA_PUBLIC_KEY';
const LIFETIME_MARKER = 'LIFETIME';

const TEMPORARY_ACTIVATION_PATTERN = /^DAY-(\d+)$/i;

const buildActivationSignaturePayload = (activation) => {
  const isTemporary = TEMPORARY_ACTIVATION_PATTERN.test(activation.activationCode);

  if (isTemporary) {
    if (!activation.expiresAt) {
      throw new Error('Temporary activation must have expiresAt');
    }
    return `${activation.deviceId}|${activation.activationCode}|${activation.expiresAt}`;
  }

  return `${activation.deviceId}|${activation.activationCode}|LIFETIME`;
};

const resolvePrivateKey = () => {
  if (process.env[PRIVATE_KEY_ENV_NAME]) {
    return process.env[PRIVATE_KEY_ENV_NAME].replace(/\\n/g, '\n');
  }

  if (process.env[PRIVATE_KEY_PATH_ENV_NAME]) {
    return fs.readFileSync(process.env[PRIVATE_KEY_PATH_ENV_NAME], 'utf8');
  }

  throw new Error(
    `Missing RSA private key. Set ${PRIVATE_KEY_ENV_NAME} or ${PRIVATE_KEY_PATH_ENV_NAME}.`
  );
};

const signActivationData = (activation) => {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(buildActivationSignaturePayload(activation), 'utf8');
  signer.end();

  return signer.sign(resolvePrivateKey(), 'base64');
};

const getConfiguredPublicKey = () => {
  if (!process.env[PUBLIC_KEY_ENV_NAME]) {
    return null;
  }

  return process.env[PUBLIC_KEY_ENV_NAME].replace(/\\n/g, '\n');
};

module.exports = {
  buildActivationSignaturePayload,
  getConfiguredPublicKey,
  signActivationData
};
