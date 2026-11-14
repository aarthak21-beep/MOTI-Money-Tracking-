import { Account, Client } from 'appwrite';

export const APPWRITE_ENDPOINT = 'https://sgp.cloud.appwrite.io/v1';
export const APPWRITE_PROJECT_ID = '6aedba7500289424a374';
export const CLOUD_WORKER_URL = 'https://moti-cloud-storage.motidiagnostics.workers.dev';

const client = new Client()
  .setEndpoint(APPWRITE_ENDPOINT)
  .setProject(APPWRITE_PROJECT_ID);

export const appwriteAccount = new Account(client);

export interface FinovaUser {
  $id: string;
  name: string;
  email: string;
}

export async function getAppwriteJwt(): Promise<string> {
  const result = await appwriteAccount.createJWT();
  if (!result.jwt) throw new Error('Could not create a secure session token.');
  return result.jwt;
}

export async function getCurrentFinovaUser(): Promise<FinovaUser> {
  return await appwriteAccount.get() as FinovaUser;
}
