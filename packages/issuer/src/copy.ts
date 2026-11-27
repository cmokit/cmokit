// The one-time copy of people from the issuer's old records, one Durable Object per person and per
// way in (ADR-0030), into Better Auth's tables. Each person keeps their id, so every brand's records,
// which name people by id, stay as they are. Every way in a person had comes with them, as did their
// proven email address, their brands with the names they gave them, and the Instagram account they
// last signed in with. It is safe to repeat: a person already copied is left alone. The old records
// are left as they are, so nothing is lost if a copy goes wrong. What it reports names people only by
// id, never by address or handle.

import type { Brand, Issuer } from './index.ts';
import { standIn, type InstagramAccount } from './providers.ts';

/** What a person's old object holds. */
export interface OldPerson {
  identities: string[];
  email: string | null;
  instagram: InstagramAccount | null;
  brands: Brand[];
}

export interface CopyReport {
  copied: string[];
  alreadyCopied: string[];
  /** People whose old object holds nothing, as after their account was deleted. */
  empty: string[];
  /** People whose copy failed part way, which is taken back so that running it again copies them whole. */
  failed: string[];
  /** Ways in that were not copied: an extra email address, or one another person already has. */
  skipped: { person: string; identity: string; reason: string }[];
}

/** The old identities' providers, by Better Auth's provider id. */
const PROVIDER: Record<string, string> = { github: 'github', google: 'google', meta: 'facebook', instagram: 'instagram' };

export async function copyPeople(issuer: Issuer, people: Iterable<string>, read: (person: string) => Promise<OldPerson>, now = Date.now): Promise<CopyReport> {
  const db = await issuer.adapter();
  const report: CopyReport = { copied: [], alreadyCopied: [], empty: [], failed: [], skipped: [] };

  for (const person of new Set(people)) {
    if (await db.findOne({ model: 'user', where: [{ field: 'id', value: person }] })) {
      report.alreadyCopied.push(person);
      continue;
    }
    const old = await read(person);
    if (old.identities.length === 0) {
      report.empty.push(person);
      continue;
    }

    try {
      await copyOne(person, old);
      report.copied.push(person);
    } catch (error) {
      console.error('Copying a person failed', person, error);
      await issuer.deletePerson(person);
      report.failed.push(person);
    }
  }
  return report;

  async function copyOne(person: string, old: OldPerson): Promise<void> {
    // A proven address is kept unless another person already has it; otherwise a stand-in names them.
    const proven = old.email && !(await db.findOne({ model: 'user', where: [{ field: 'email', value: old.email }] })) ? old.email : null;
    const at = new Date(now());
    await db.create({
      model: 'user',
      forceAllowId: true,
      data: { id: person, email: proven ?? standIn('copied', person), emailVerified: Boolean(proven), name: old.instagram?.handle ?? proven ?? '', createdAt: at, updatedAt: at },
    });

    for (const identity of old.identities) {
      const split = identity.indexOf(':');
      const kind = identity.slice(0, split);
      const subject = identity.slice(split + 1);
      if (kind === 'email') {
        if (subject !== proven) report.skipped.push({ person, identity: 'email', reason: proven ? 'a second email address' : 'an address another person has' });
        continue;
      }
      const providerId = PROVIDER[kind];
      if (!providerId) {
        report.skipped.push({ person, identity: kind, reason: 'an unknown kind of way in' });
        continue;
      }
      if (await db.findOne({ model: 'account', where: [{ field: 'providerId', value: providerId }, { field: 'accountId', value: subject }] })) {
        report.skipped.push({ person, identity: kind, reason: 'a way in another person has' });
        continue;
      }
      await db.create({ model: 'account', data: { providerId, accountId: subject, userId: person, createdAt: at, updatedAt: at } });
    }

    for (const [index, brand] of old.brands.entries()) {
      await db.create({ model: 'brand', data: { person, slug: brand.slug, name: brand.name, addedAt: index } });
    }

    // The Instagram account they last signed in with, under the Meta login that shared it.
    const metaIds = old.identities.filter((i) => i.startsWith('instagram:')).map((i) => i.slice('instagram:'.length));
    const metaId = metaIds[metaIds.length - 1];
    if (old.instagram && metaId) {
      await db.deleteMany({ model: 'instagramSignIn', where: [{ field: 'metaId', value: metaId }] });
      await db.create({ model: 'instagramSignIn', data: { metaId, instagramId: old.instagram.id, handle: old.instagram.handle, at: now() } });
    }
  }
}
