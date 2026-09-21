const fs = require('fs');

module.exports = ({ config }) => {
  const localGoogleServices = './google-services.json';
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON || (fs.existsSync(localGoogleServices) ? localGoogleServices : undefined);

  return {
    ...config,
    android: {
      ...config.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
  };
};
