import * as FileSystem from 'expo-file-system/legacy';
import type { FileIO } from './fileIO';

// The app's private, persistent document storage directory. This is where
// createDefaultRecipeRepository (src/data/index.ts) points the user data
// JSON store, so callers never need to know that Expo v57 moved
// `documentDirectory` into the '/legacy' subpath.
export const userDataDirectory = FileSystem.documentDirectory ?? '';

export const expoFileIO: FileIO = {
  async exists(path) {
    const info = await FileSystem.getInfoAsync(path);
    return info.exists;
  },
  readText: (path) => FileSystem.readAsStringAsync(path),
  writeText: (path, content) => FileSystem.writeAsStringAsync(path, content),
  move: (from, to) => FileSystem.moveAsync({ from, to }),
};
