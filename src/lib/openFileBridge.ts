import { Capacitor, registerPlugin } from '@capacitor/core';

type OpenFilePlugin = {
  openDownloadedFile(options: { fileName: string }): Promise<void>;
};

const OpenFile = registerPlugin<OpenFilePlugin>('OpenFile');

export async function openDownloadedFile(fileName: string): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  await OpenFile.openDownloadedFile({ fileName });
  return true;
}
