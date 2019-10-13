import {Fetcher, FetchOptions, MinimalFetchOptions}    from '@yarnpkg/core';
import {Locator, MessageName}                          from '@yarnpkg/core';
import {miscUtils, scriptUtils, structUtils, tgzUtils} from '@yarnpkg/core';
import {PortablePath, ppath, xfs}                      from '@yarnpkg/fslib';

import {GIT_REGEXP}                                    from './constants';
import * as gitUtils                                   from './gitUtils';

export class GitFetcher implements Fetcher {
  supports(locator: Locator, opts: MinimalFetchOptions) {
    if (locator.reference.match(GIT_REGEXP))
      return true;

    return false;
  }

  getLocalPath(locator: Locator, opts: FetchOptions) {
    return null;
  }

  async fetch(locator: Locator, opts: FetchOptions) {
    const expectedChecksum = opts.checksums.get(locator.locatorHash) || null;

    const [packageFs, releaseFs, checksum] = await opts.cache.fetchPackageFromCache(
      locator,
      expectedChecksum,
      async () => {
        opts.report.reportInfoOnce(MessageName.FETCH_NOT_CACHED, `${structUtils.prettyLocator(opts.project.configuration, locator)} can't be found in the cache and will be fetched from the remote repository`);
        return await this.cloneFromRemote(locator, opts);
      },
    );

    return {
      packageFs,
      releaseFs,
      prefixPath: `/sources` as PortablePath,
      checksum,
    };
  }

  async cloneFromRemote(locator: Locator, opts: FetchOptions) {
    const cloneTarget = await gitUtils.clone(locator.reference, opts.project.configuration);

    const packagePath = ppath.join(cloneTarget, `package.tgz` as PortablePath);
    await scriptUtils.prepareExternalProject(cloneTarget, packagePath, {
      configuration: opts.project.configuration,
      report: opts.report,
    });

    const sourceBuffer = await xfs.readFilePromise(packagePath);

    return await miscUtils.releaseAfterUseAsync(async () => {
      return await tgzUtils.convertToZip(sourceBuffer, {
        stripComponents: 1,
        prefixPath: `/sources` as PortablePath,
      });
    });
  }
}
