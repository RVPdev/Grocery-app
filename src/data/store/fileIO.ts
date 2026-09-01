export interface FileIO {
  exists(path: string): Promise<boolean>;
  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  move(from: string, to: string): Promise<void>;
}
