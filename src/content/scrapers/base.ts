export interface Scraper {
  fillInput(text: string): Promise<void>;
  clickSend(): Promise<void>;
  observeResponse(onData: (text: string, isComplete: boolean) => void): () => void;
}
