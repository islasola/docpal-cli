const path = require('path');
const fs = require('fs');

class ConfigLoader {
  constructor() {
    this.config = {
      appId: process.env.APP_ID,
      appSecret: process.env.APP_SECRET,
      feishuHost: process.env.FEISHU_HOST || 'https://open.feishu.cn',
      feishuTenant: process.env.FEISHU_TENANT || '',

      authMode: process.env.DOCPAL_AUTH_MODE || 'bot',

      authFilePath: process.env.DOCPAL_AUTH_FILE ||
        path.join(process.env.HOME || process.env.USERPROFILE || '~', '.docpal', 'auth.json'),

      githubToken: process.env.GITHUB_TOKEN,

      baseToken: process.env.BASE_TOKEN || process.env.REGISTRY_BASE_TOKEN,

      spaceId: process.env.SPACE_ID,

      imageBedUrl: process.env.IMAGE_BED_URL || 'https://zdoc-images.s3.us-west-2.amazonaws.com',

      figmaApiKey: process.env.FIGMA_API_KEY,

      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'us-west-2',
      awsBucket: process.env.AWS_BUCKET,

      ossRegion: process.env.OSS_REGION,
      ossAccessKeyId: process.env.OSS_ACCESS_KEY_ID,
      ossAccessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
      ossBucket: process.env.OSS_BUCKET,
      ossEndpoint: process.env.OSS_ENDPOINT,
    };
  }

  get(key) {
    return this.config[key];
  }

  require(key) {
    const value = this.config[key];
    if (!value) {
      throw new Error(`Missing required config: ${key}. Set it in .env file.`);
    }
    return value;
  }

  validate(requiredKeys) {
    for (const key of requiredKeys) {
      this.require(key);
    }
  }

  get hasS3() {
    return !!(this.config.awsAccessKeyId && this.config.awsSecretAccessKey && this.config.awsBucket);
  }

  get hasOSS() {
    return !!(this.config.ossAccessKeyId && this.config.ossAccessKeySecret && this.config.ossBucket);
  }

  get feishuWebHost() {
    const tenant = this.config.feishuTenant;
    if (tenant) {
      return this.config.feishuHost.replace('://open.', `://${tenant}.`);
    }
    return this.config.feishuHost;
  }

  getBaseToken(cliOverride) {
    return cliOverride || this.config.baseToken || null;
  }

  requireBaseToken(cliOverride) {
    const token = this.getBaseToken(cliOverride);
    if (!token) {
      throw new Error('No base token configured. Run `docpal init` or set BASE_TOKEN in .env');
    }
    return token;
  }

  saveBaseToken(token) {
    const envPath = path.resolve(__dirname, '..', '..', '..', '.env');

    let content = '';
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8');
    }

    const lines = content.split('\n');
    let found = false;
    const newLines = lines.map(line => {
      if (line.startsWith('BASE_TOKEN=')) {
        found = true;
        return `BASE_TOKEN=${token}`;
      }
      if (line.startsWith('REGISTRY_BASE_TOKEN=') && !found) {
        found = true;
        return `BASE_TOKEN=${token}`;
      }
      return line;
    });

    if (!found) {
      newLines.push(`BASE_TOKEN=${token}`);
    }

    fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');

    this.config.baseToken = token;

    process.env.BASE_TOKEN = token;
  }
}

module.exports = new ConfigLoader();