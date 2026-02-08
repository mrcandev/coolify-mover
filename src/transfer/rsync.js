const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class VolumeTransfer {
  constructor(keysPath, tempDir) {
    this.keysPath = keysPath;
    this.tempDir = tempDir || '/tmp/coolify-mover';
  }

  getKeyPath(privateKeyUuid) {
    return path.join(this.keysPath, `ssh_key@${privateKeyUuid}`);
  }

  async transfer(options) {
    const {
      sourceServer,
      targetServer,
      sourceVolume,
      targetVolume,
      viaLocalhost = true,
      dryRun = false
    } = options;

    const sourceKeyPath = this.getKeyPath(sourceServer.private_key_uuid || sourceServer.private_key_id);
    const targetKeyPath = this.getKeyPath(targetServer.private_key_uuid || targetServer.private_key_id);

    const sourcePath = `/var/lib/docker/volumes/${sourceVolume}/_data/`;
    const targetPath = `/var/lib/docker/volumes/${targetVolume}/_data/`;

    if (viaLocalhost) {
      return await this.transferViaLocalhost({
        sourceServer,
        targetServer,
        sourceKeyPath,
        targetKeyPath,
        sourcePath,
        targetPath,
        sourceVolume,
        dryRun
      });
    } else {
      return await this.transferDirect({
        sourceServer,
        targetServer,
        sourceKeyPath,
        sourcePath,
        targetPath,
        dryRun
      });
    }
  }

  async transferViaLocalhost(options) {
    const {
      sourceServer,
      targetServer,
      sourceKeyPath,
      targetKeyPath,
      sourcePath,
      targetPath,
      sourceVolume,
      dryRun
    } = options;

    const tempDir = path.join(this.tempDir, sourceVolume);

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    const dryRunFlag = dryRun ? '--dry-run' : '';

    // Step 1: Source -> Localhost
    console.log('\n[1/2] Pulling from source server...');
    await this.rsyncExec(
      `rsync -avz --progress ${dryRunFlag} -e "ssh -i ${sourceKeyPath} -o StrictHostKeyChecking=no" ` +
      `${sourceServer.user || 'root'}@${sourceServer.ip}:${sourcePath} ${tempDir}/`
    );

    // Step 2: Localhost -> Target
    console.log('\n[2/2] Pushing to target server...');
    await this.rsyncExec(
      `rsync -avz --progress ${dryRunFlag} -e "ssh -i ${targetKeyPath} -o StrictHostKeyChecking=no" ` +
      `${tempDir}/ ${targetServer.user || 'root'}@${targetServer.ip}:${targetPath}`
    );

    // Cleanup temp files (unless dry run)
    if (!dryRun && fs.existsSync(tempDir)) {
      console.log('\nCleaning up temp files...');
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    return true;
  }

  async transferDirect(options) {
    const {
      sourceServer,
      targetServer,
      sourceKeyPath,
      sourcePath,
      targetPath,
      dryRun
    } = options;

    const dryRunFlag = dryRun ? '--dry-run' : '';

    console.log('\nTransferring directly between servers...');
    await this.rsyncExec(
      `rsync -avz --progress ${dryRunFlag} -e "ssh -i ${sourceKeyPath} -o StrictHostKeyChecking=no" ` +
      `${sourceServer.user || 'root'}@${sourceServer.ip}:${sourcePath} ` +
      `${targetServer.user || 'root'}@${targetServer.ip}:${targetPath}`
    );

    return true;
  }

  rsyncExec(command) {
    return new Promise((resolve, reject) => {
      console.log(`Executing: ${command}\n`);

      const proc = spawn('bash', ['-c', command], {
        stdio: 'inherit'
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`rsync failed with exit code ${code}`));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }
}

module.exports = VolumeTransfer;
