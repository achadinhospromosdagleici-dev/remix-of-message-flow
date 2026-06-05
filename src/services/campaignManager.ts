import { updateCampaignStatus } from './campaigns';

class CampaignManager {
  private controllers = new Map<string, AbortController>();
  private progressTimers = new Map<string, ReturnType<typeof setInterval>>();

  register(campaignId: string, controller: AbortController): void {
    this.controllers.set(campaignId, controller);
  }

  getController(campaignId: string): AbortController | undefined {
    return this.controllers.get(campaignId);
  }

  isRunning(campaignId: string): boolean {
    return this.controllers.has(campaignId);
  }

  async pause(campaignId: string): Promise<void> {
    const controller = this.controllers.get(campaignId);
    if (controller) {
      controller.abort();
      this.controllers.delete(campaignId);
    }
    this.clearProgressTimer(campaignId);
  }

  async resume(campaignId: string): Promise<void> {
  }

  async cancel(campaignId: string): Promise<void> {
    const controller = this.controllers.get(campaignId);
    if (controller) {
      controller.abort();
      this.controllers.delete(campaignId);
    }
    this.clearProgressTimer(campaignId);
    await updateCampaignStatus(campaignId, 'cancelled');
  }

  unregister(campaignId: string): void {
    this.controllers.delete(campaignId);
    this.clearProgressTimer(campaignId);
  }

  registerProgressTimer(campaignId: string, interval: ReturnType<typeof setInterval>): void {
    this.clearProgressTimer(campaignId);
    this.progressTimers.set(campaignId, interval);
  }

  private clearProgressTimer(campaignId: string): void {
    const existing = this.progressTimers.get(campaignId);
    if (existing) {
      clearInterval(existing);
      this.progressTimers.delete(campaignId);
    }
  }
}

export const campaignManager = new CampaignManager();
