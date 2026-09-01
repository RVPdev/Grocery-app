import * as FileSystem from 'expo-file-system/legacy';
import type { FileIO } from './fileIO';

export const expoFileIO: FileIO = {
  async exists(path) {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  },
  readText: (path) => FileSystem.readAsStringAsync(path),
  writeText: (path, content) => FileSystem.writeAsStringAsync(path, content),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
};
