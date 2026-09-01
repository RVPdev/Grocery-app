import type { Recipe } from '../../domain/recipes/types';
import type { FileIO } from './fileIO';

export type UserData = {
  recipes: Recipe[];
};

const EMPTY_USER_DATA: UserData = { recipes: [] };

function userDataPath(dir: string): string {
  return `${dir}/user-data.json`;
}

function tempPath(dir: string): string {
  return `${dir}/user-data.json.tmp`;
}

export async function readUserData(io: FileIO, dir: string): Promise<UserData> {
  const path = userDataPath(dir);
  if (!(await io.exists(path))) {
    return EMPTY_USER_DATA;
  }
  const content = await io.readText(path);
  return JSON.parse(content) as UserData;
}

export async function writeUserData(io: FileIO, dir: string, data: UserData): Promise<void> {
  const tmp = tempPath(dir);
  await io.writeText(tmp, JSON.stringify(data));
  await io.move(tmp, userDataPath(dir));
}
