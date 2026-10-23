/**
 * La garde des mentions légales : un champ vide de l'éditeur fait échouer
 * la construction en CI, et seulement en CI (le poste affiche « à
 * compléter »). Le test pose ses propres valeurs : il ne dépend pas de
 * l'état réel du fichier.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { EDITEUR, champsManquants, exigerEditeurEnCI } from '../src/i18n/editeur';

const origine = { ...EDITEUR };
const ci = process.env.CI;

afterEach(() => {
  Object.assign(EDITEUR, origine);
  if (ci === undefined) delete process.env.CI;
  else process.env.CI = ci;
});

const remplir = () =>
  Object.assign(EDITEUR, { nom: 'A', adresse: 'B', siren: 'C', telephone: 'D', directeur: 'E' });

describe('Publisher identity guard', () => {
  it('names the empty fields', () => {
    remplir();
    EDITEUR.siren = ' ';
    expect(champsManquants()).toEqual(['siren']);
  });

  it('fails the build in CI when a field is empty', () => {
    remplir();
    EDITEUR.telephone = '';
    process.env.CI = 'true';
    expect(() => exigerEditeurEnCI()).toThrow(/telephone/);
  });

  it('lets a local build through, which shows the gap on the page', () => {
    remplir();
    EDITEUR.nom = '';
    delete process.env.CI;
    expect(() => exigerEditeurEnCI()).not.toThrow();
  });

  it('passes in CI once every field is filled', () => {
    remplir();
    process.env.CI = 'true';
    expect(() => exigerEditeurEnCI()).not.toThrow();
  });
});
