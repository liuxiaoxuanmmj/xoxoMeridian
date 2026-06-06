declare module "ali-oss" {
  type OssClientOptions = Record<string, string>;

  export default class OSS {
    constructor(options: OssClientOptions);
  }
}
