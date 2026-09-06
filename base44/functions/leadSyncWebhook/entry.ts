import { handleLeadWebhook } from '../../shared/leadMapping.ts';

export default async function (req) {
  return handleLeadWebhook(req);
}