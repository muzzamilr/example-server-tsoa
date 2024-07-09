import { google } from 'googleapis';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { execSync } from 'child_process';

dotenv.config();

async function getFileChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);

    stream.on('data', data => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function uploadFile() {
  const branchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  const localFilePath = 'http/output/schema.ts';

  const auth = new google.auth.GoogleAuth({
    keyFile: './credentials.json',
    scopes: ['https://www.googleapis.com/auth/drive'],
  });

  const drive = google.drive({ version: 'v3', auth });

  try {
    const listResponse = await drive.files.list({
      q: `name contains '${branchName}-' and trashed=false`,
      fields: 'files(id, name, md5Checksum)',
    });

    const files = listResponse.data.files;
    if (files.length > 0) {
      const remoteFileId = files[0].id;
      const remoteFileName = files[0].name;
      const remoteFileChecksum = files[0].md5Checksum;

      const localFileChecksum = await getFileChecksum(localFilePath);

      if (localFileChecksum === remoteFileChecksum) {
        console.log(`File ${remoteFileName} is the same as the local file. Skipping upload.`);
        return;
      }

      await drive.files.delete({ fileId: remoteFileId });
    }

    const randomHash = crypto.randomBytes(6).toString('hex');
    const fileName = `schema-${branchName}-${randomHash}.ts`;

    const fileMetadata = {
      name: fileName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    };
    const media = {
      mimeType: 'application/typescript',
      body: fs.createReadStream(localFilePath),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: 'id',
    });
    console.log('Uploaded new file with Id:', response.data.id);

  } catch (error) {
    console.error('Error:', error);
  }
}

uploadFile();
