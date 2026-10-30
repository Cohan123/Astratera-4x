/**
 * Astraea 4X - Private Sector (Phase 3)
 * Models the civilian economy between the colonies of one empire. Private
 * traders never appear as ships or routes: they are an abstract, deterministic
 * layer that (a) pays a commerce tax into the imperial treasury and (b) moves
 * small amounts of goods from real surpluses to real shortages inside the same
 * empire. State logistics and galactic trade stay the bulk transport systems;
 * the private sector only fills the gaps they leave behind.
 */

import { EconomyEngine } from './economyEngine.ts';
import { Civilization, Colony } from './types.ts';

/** Güter, die zivile Händler zwischen eigenen Kolonien bewegen. */
export type PrivateSectorResource = 'food' | 'minerals' | 'rareResources';

export const PRIVATE_SECTOR_RESOURCES: PrivateSectorResource[] = [
  'food',
  'minerals',
  'rareResources',
];

/** Basis-Handelsvolumen in Credits je Bevölkerungs-Einheit und Runde (vor Stufen- und Zufriedenheitsfaktor). */
export const PRIVATE_SECTOR_COMMERCE_PER_POP_UNIT = 6;

/** Multiplikator des Handelsvolumens je Entwicklungsstufe. */
export const PRIVATE_SECTOR_TIER_COMMERCE: Record<Colony['developmentTier'], number> = {
  outpost: 0.5,
  settlement: 1,
  colony: 1.5,
};

/** Anteil des Handelsvolumens, der als Handelssteuer an die Staatskasse fließt. */
export const PRIVATE_SECTOR_TAX_RATE = 0.25;

/**
 * Ein Geber behält so viel von jedem Gut, bevor zivile Händler zugreifen.
 * Muss je Gut strikt über PRIVATE_SECTOR_TARGET_STOCK liegen, damit eine
 * Kolonie nie gleichzeitig Geber und Empfänger desselben Gutes ist.
 */
export const PRIVATE_SECTOR_RESERVE: Record<PrivateSectorResource, number> = {
  food: 60,
  minerals: 60,
  rareResources: 25,
};

/** Empfänger werden nur bis zu diesem Bestand aufgefüllt (deutlich unter der Staatslogistik). */
export const PRIVATE_SECTOR_TARGET_STOCK: Record<PrivateSectorResource, number> = {
  food: 40,
  minerals: 40,
  rareResources: 15,
};

/** Frachteinheiten je Bevölkerungs-Einheit und Runde, die eine Kolonie als Geber bereitstellt. */
export const PRIVATE_SECTOR_CAPACITY_PER_POP_UNIT: Record<Colony['developmentTier'], number> = {
  outpost: 1,
  settlement: 2,
  colony: 3,
};

export interface PrivateSectorTransfer {
  fromColonyId: string;
  toColonyId: string;
  resource: PrivateSectorResource;
  amount: number;
}

export interface PrivateSectorCivReport {
  civId: string;
  /** Anzahl aktiver Kolonien, die am Privatsektor teilnehmen. */
  colonyCount: number;
  /** Handelsvolumen der Zivilisation in Credits pro Runde. */
  commerceVolume: number;
  /** Handelssteuer, die in dieser Runde der Staatskasse gutgeschrieben wurde. */
  commerceTax: number;
  /** Zivile Frachtkapazität der Zivilisation in Einheiten pro Runde. */
  capacity: number;
  /** Vom Geber abgegebene Einheiten je Gut. */
  shipped: Record<PrivateSectorResource, number>;
  /** Beim Empfänger angekommene Einheiten je Gut (Summe identisch zu `shipped`). */
  delivered: Record<PrivateSectorResource, number>;
  transfers: PrivateSectorTransfer[];
}

function roundTo1(value: number): number {
  return Math.round(value * 10) / 10;
}

function compareIds(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function emptyRecord(): Record<PrivateSectorResource, number> {
  return { food: 0, minerals: 0, rareResources: 0 };
}

export class PrivateSectorManager {
  private lastReports: PrivateSectorCivReport[] = [];

  /**
   * Handelsvolumen einer Kolonie in Credits pro Runde.
   * Die Zufriedenheit wird aus Steuersatz und Entwicklungsstufe abgeleitet
   * (identisch zu `EconomyEngine.calculateApproval`), damit der Wert nie auf
   * einem veralteten gespeicherten Feld beruht.
   */
  public static calculateCommerceVolume(colony: Colony): number {
    const tier = colony.developmentTier ?? 'outpost';
    const popUnits = EconomyEngine.getPopulationUnits(colony.population);
    const approval = EconomyEngine.calculateApproval(
      EconomyEngine.normalizeTaxRate(colony.taxRate),
      tier,
    );
    const tierFactor = PRIVATE_SECTOR_TIER_COMMERCE[tier] ?? PRIVATE_SECTOR_TIER_COMMERCE.outpost;
    return roundTo1(popUnits * PRIVATE_SECTOR_COMMERCE_PER_POP_UNIT * tierFactor * (approval / 100));
  }

  /** Handelssteuer einer Kolonie in Credits pro Runde. */
  public static calculateCommerceTax(commerceVolume: number): number {
    if (!Number.isFinite(commerceVolume) || commerceVolume <= 0) return 0;
    return roundTo1(commerceVolume * PRIVATE_SECTOR_TAX_RATE);
  }

  /** Zivile Frachtkapazität einer Kolonie in Einheiten pro Runde (über alle Güter). */
  public static calculateCapacity(colony: Colony): number {
    const tier = colony.developmentTier ?? 'outpost';
    const popUnits = EconomyEngine.getPopulationUnits(colony.population);
    const perPop = PRIVATE_SECTOR_CAPACITY_PER_POP_UNIT[tier] ?? 1;
    return Math.max(1, Math.floor(popUnits * perPop));
  }

  public getLastReports(): PrivateSectorCivReport[] {
    return this.lastReports;
  }

  public getReportForCiv(civId: string): PrivateSectorCivReport | null {
    return this.lastReports.find((report) => report.civId === civId) ?? null;
  }

  /** Verwirft die abgeleiteten Berichte (Galaxiewechsel, Ladevorgang). */
  public clear(): void {
    this.lastReports = [];
  }

  /**
   * Advances the private sector by one turn.
   *
   * Deterministic order:
   * 1. civilizations by id (or, if none are passed, the civ ids of the colonies)
   * 2. colonies by id
   * 3. resources food → minerals → rareResources
   * 4. donors by surplus (descending), then id
   * 5. receivers by stock (ascending), then id
   *
   * Every donor provides at most `calculateCapacity()` units per turn across all
   * resources, never drops below `PRIVATE_SECTOR_RESERVE` and never moves goods
   * to another civilization. Goods are conserved: shipped equals delivered.
   */
  public advanceTurn(
    colonies: Colony[],
    civilizations: Civilization[] = [],
  ): PrivateSectorCivReport[] {
    const activeColonies = colonies.filter((colony) => colony.status === 'active');
    const civIds =
      civilizations.length > 0
        ? Array.from(new Set(civilizations.map((civ) => civ.id))).sort(compareIds)
        : Array.from(new Set(activeColonies.map((colony) => colony.civId))).sort(compareIds);

    const reports: PrivateSectorCivReport[] = [];

    for (const civId of civIds) {
      const ownColonies = activeColonies
        .filter((colony) => colony.civId === civId)
        .sort((a, b) => compareIds(a.id, b.id));
      if (ownColonies.length === 0) continue;

      const commerceVolume = roundTo1(
        ownColonies.reduce(
          (sum, colony) => sum + PrivateSectorManager.calculateCommerceVolume(colony),
          0,
        ),
      );
      const commerceTax = roundTo1(
        ownColonies.reduce(
          (sum, colony) =>
            sum +
            PrivateSectorManager.calculateCommerceTax(
              PrivateSectorManager.calculateCommerceVolume(colony),
            ),
          0,
        ),
      );
      const capacity = ownColonies.reduce(
        (sum, colony) => sum + PrivateSectorManager.calculateCapacity(colony),
        0,
      );

      const capacityLeft = new Map<string, number>(
        ownColonies.map((colony) => [
          colony.id,
          PrivateSectorManager.calculateCapacity(colony),
        ]),
      );
      const shipped = emptyRecord();
      const delivered = emptyRecord();
      const transfers: PrivateSectorTransfer[] = [];

      for (const resource of PRIVATE_SECTOR_RESOURCES) {
        const donors = ownColonies
          .map((colony) => ({
            colony,
            surplus: Math.floor(colony.stockpile[resource] - PRIVATE_SECTOR_RESERVE[resource]),
          }))
          .filter((entry) => entry.surplus > 0)
          .sort(
            (a, b) => b.surplus - a.surplus || compareIds(a.colony.id, b.colony.id),
          );
        if (donors.length === 0) continue;

        const receivers = ownColonies
          .filter((colony) => colony.stockpile[resource] < PRIVATE_SECTOR_TARGET_STOCK[resource])
          .sort(
            (a, b) =>
              a.stockpile[resource] - b.stockpile[resource] || compareIds(a.id, b.id),
          );

        for (const receiver of receivers) {
          let need = Math.ceil(
            PRIVATE_SECTOR_TARGET_STOCK[resource] - receiver.stockpile[resource],
          );
          for (const { colony: donor } of donors) {
            if (need <= 0) break;
            if (donor.id === receiver.id) continue;

            const budget = capacityLeft.get(donor.id) ?? 0;
            if (budget <= 0) continue;

            const available = Math.floor(
              donor.stockpile[resource] - PRIVATE_SECTOR_RESERVE[resource],
            );
            if (available <= 0) continue;

            const amount = Math.min(need, available, budget);
            if (amount <= 0) continue;

            donor.stockpile[resource] -= amount;
            receiver.stockpile[resource] += amount;
            capacityLeft.set(donor.id, budget - amount);
            need -= amount;

            shipped[resource] += amount;
            delivered[resource] += amount;
            transfers.push({
              fromColonyId: donor.id,
              toColonyId: receiver.id,
              resource,
              amount,
            });
          }
        }
      }

      reports.push({
        civId,
        colonyCount: ownColonies.length,
        commerceVolume,
        commerceTax,
        capacity,
        shipped,
        delivered,
        transfers,
      });
    }

    this.lastReports = reports;
    return reports;
  }
}
