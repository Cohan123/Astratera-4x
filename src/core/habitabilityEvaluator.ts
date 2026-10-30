/**
 * Astraea 4X - Habitability Evaluator
 * Deterministic, transparent assessment of a planet's colonization suitability.
 * Provides granular positive and negative environmental factor breakdowns.
 */

import {
  HabitabilityAssessment,
  HabitabilityFactor,
  HabitabilityTier,
  Planet,
} from './types.ts';

export class HabitabilityEvaluator {
  /**
   * Evaluates planet suitability for normal surface colonization
   */
  public static evaluate(planet: Planet): HabitabilityAssessment {
    const factors: HabitabilityFactor[] = [];
    let score = 50; // Neutral starting baseline

    // 1. Gas Giant Hard Rule
    if (planet.planetType === 'gas_giant') {
      return {
        score: 0,
        tier: 'uninhabitable',
        categoryLabel: 'Für normale Besiedelung ungeeignet',
        factors: [
          {
            title: 'Gasriese ohne feste Oberfläche',
            impactPercent: -100,
            isPositive: false,
            description: 'Keine feste Planetenkruste für Bodenkolonien vorhanden.',
          },
        ],
        canColonizeNormally: false,
        summary: 'Gasriesen besitzen keine feste Kruste und können nicht normal besiedelt werden.',
      };
    }

    // 2. Planet Type Factors
    switch (planet.planetType) {
      case 'ocean':
        score += 20;
        factors.push({
          title: 'Ozeanwelt-Biosphäre',
          impactPercent: 20,
          isPositive: true,
          description: 'Reichhaltiges hydrostatisches Gleichgewicht mit exzellenten Biosphärenbedingungen.',
        });
        break;
      case 'rocky':
        score += 15;
        factors.push({
          title: 'Stabile Silikatkruste',
          impactPercent: 15,
          isPositive: true,
          description: 'Feste geologische Formationen bieten optimale Baufundamente.',
        });
        break;
      case 'desert':
        score -= 5;
        factors.push({
          title: 'Aride Wüstenlandschaft',
          impactPercent: -5,
          isPositive: false,
          description: 'Trockenes Terrain erschwert autarke Agrarversorgung.',
        });
        break;
      case 'ice':
        score -= 20;
        factors.push({
          title: 'Kryoplanetare Bedingungen',
          impactPercent: -20,
          isPositive: false,
          description: 'Tiefe Permafrostböden erfordern permanente Thermal-Infrastruktur.',
        });
        break;
      case 'volcanic':
        score -= 35;
        factors.push({
          title: 'Aktiver Magmatismus',
          impactPercent: -35,
          isPositive: false,
          description: 'Häufige Eruptionen und seismische Instabilität gefährden Koloniebauten.',
        });
        break;
      case 'toxic':
        score -= 40;
        factors.push({
          title: 'Feindselige Umweltmatrix',
          impactPercent: -40,
          isPositive: false,
          description: 'Chemisch aggressive Umweltbedingungen greifen Materialien an.',
        });
        break;
    }

    // 3. Atmosphere Factors
    switch (planet.atmosphere) {
      case 'breathable':
        score += 20;
        factors.push({
          title: 'Atembare N2/O2-Atmosphäre',
          impactPercent: 20,
          isPositive: true,
          description: 'Keine Druckanzüge oder Atemfilter für Kolonisten erforderlich.',
        });
        break;
      case 'thin':
        score -= 10;
        factors.push({
          title: 'Dünne Restatmosphäre',
          impactPercent: -10,
          isPositive: false,
          description: 'Druckhauben und künstliche Sauerstoffversorgung zwingend nötig.',
        });
        break;
      case 'dense':
        score -= 15;
        factors.push({
          title: 'Hoher Atmosphärendruck',
          impactPercent: -15,
          isPositive: false,
          description: 'Extremer barometrischer Druck belastet Schiffs- und Siedlungsstrukturen.',
        });
        break;
      case 'none':
        score -= 25;
        factors.push({
          title: 'Vakuum / Keine Schutzhülle',
          impactPercent: -25,
          isPositive: false,
          description: 'Vollständige Abhängigkeit von hermetisch versiegelten Habitaten.',
        });
        break;
      case 'toxic':
        score -= 35;
        factors.push({
          title: 'Toxische Gaskonzentration',
          impactPercent: -35,
          isPositive: false,
          description: 'Lethale Umweltgase (Ammoniak, Methan) erfordern permanente Dekontamination.',
        });
        break;
      case 'corrosive':
        score -= 40;
        factors.push({
          title: 'Ätzende Säureatmosphäre',
          impactPercent: -40,
          isPositive: false,
          description: 'Säurehaltige Niederschläge zersetzen Außenhüllen.',
        });
        break;
    }

    // 4. Temperature Factors
    switch (planet.temperatureCategory) {
      case 'temperate':
        score += 15;
        factors.push({
          title: 'Gemäßigte Oberflächentemperatur',
          impactPercent: 15,
          isPositive: true,
          description: `Stabile Durchschnittstemperaturen (${planet.surfaceTemperatureK} K) im Goldilocks-Bereich.`,
        });
        break;
      case 'cold':
        score -= 10;
        factors.push({
          title: 'Kühles Klima',
          impactPercent: -10,
          isPositive: false,
          description: 'Erhöhter Heizenergiebedarf für Habitate.',
        });
        break;
      case 'hot':
        score -= 15;
        factors.push({
          title: 'Hohe Wärmebelastung',
          impactPercent: -15,
          isPositive: false,
          description: 'Klimatisierung und Kühlaggregate erforderlich.',
        });
        break;
      case 'freezing':
        score -= 30;
        factors.push({
          title: 'Tiefgefrorene Oberfläche',
          impactPercent: -30,
          isPositive: false,
          description: 'Extreme Kälte (< 180 K) führt zu Kaltversprödung aller Materialien.',
        });
        break;
      case 'scorching':
        score -= 45;
        factors.push({
          title: 'Glühend heiße Oberfläche',
          impactPercent: -45,
          isPositive: false,
          description: 'Hitze (> 400 K) schließt ungeschützte Oberflächenbesiedelung aus.',
        });
        break;
    }

    // 5. Water Factors
    switch (planet.waterAvailability) {
      case 'liquid_ocean':
      case 'abundant':
        score += 12;
        factors.push({
          title: 'Reichhaltiges Flüssigwasser',
          impactPercent: 12,
          isPositive: true,
          description: 'Umfangreiche Trinkwasser- und Bewässerungsquellen vorhanden.',
        });
        break;
      case 'moderate':
        score += 5;
        factors.push({
          title: 'Flüssigwasserreserven',
          impactPercent: 5,
          isPositive: true,
          description: 'Ausreichende lokale Wasserbecken für Kolonieversorgung.',
        });
        break;
      case 'trace':
        score -= 12;
        factors.push({
          title: 'Spurenvorkommen an Wasser',
          impactPercent: -12,
          isPositive: false,
          description: 'Wasser muss aufwendig aus Polareis oder tiefem Gestein extrahiert werden.',
        });
        break;
      case 'none':
        score -= 25;
        factors.push({
          title: 'Vollständige Wasserarmut',
          impactPercent: -25,
          isPositive: false,
          description: 'Keinerlei Hydrosphäre vorhanden; vollständige Recyclingkette nötig.',
        });
        break;
    }

    // 6. Gravity Factors
    switch (planet.gravityCategory) {
      case 'standard':
        score += 8;
        factors.push({
          title: 'Erdähnliche Schwerkraft',
          impactPercent: 8,
          isPositive: true,
          description: `Geringe Belastung für Muskel- und Knochenstruktur (${planet.gravityG} G).`,
        });
        break;
      case 'low':
        score -= 10;
        factors.push({
          title: 'Geringe Gravitation',
          impactPercent: -10,
          isPositive: false,
          description: 'Gefahr von Knochenschwund bei Kolonisten.',
        });
        break;
      case 'high':
        score -= 15;
        factors.push({
          title: 'Hohe Schwerkraft',
          impactPercent: -15,
          isPositive: false,
          description: 'Erhöhter mechanischer Verschleiß und körperliche Erschöpfung.',
        });
        break;
      case 'extreme':
        score -= 35;
        factors.push({
          title: 'Extreme Gravitationskräfte',
          impactPercent: -35,
          isPositive: false,
          description: 'Ermüdungsbrüche und extreme Belastung physiologischer Systeme.',
        });
        break;
    }

    // 7. Radiation Hazard Factors
    switch (planet.radiationHazard) {
      case 'negligible':
        score += 5;
        factors.push({
          title: 'Magnetosphärischer Schutz',
          impactPercent: 5,
          isPositive: true,
          description: 'Starkes Magnetfeld schirmt kosmische Strahlung ab.',
        });
        break;
      case 'moderate':
        score -= 10;
        factors.push({
          title: 'Erhöhte Strahlung',
          impactPercent: -10,
          isPositive: false,
          description: 'Regelmäßige Sonnenwinde erfordern strahlungsabsorbierende Verkleidungen.',
        });
        break;
      case 'severe':
        score -= 25;
        factors.push({
          title: 'Gefährliche Strahlenbelastung',
          impactPercent: -25,
          isPositive: false,
          description: 'Dauereinwirkung erfordert dicke Blei- oder Wasserschilde.',
        });
        break;
      case 'lethal':
        score -= 45;
        factors.push({
          title: 'Tödliche Strahlungszone',
          impactPercent: -45,
          isPositive: false,
          description: 'Tödliche ionisierende Strahlung zerstört biologisches Zellgewebe.',
        });
        break;
    }

    // Clamp score to [0, 100]
    const finalScore = Math.max(0, Math.min(100, Math.round(score)));

    // Categorization into the 5 mandatory tiers
    let tier: HabitabilityTier;
    let categoryLabel: string;
    let canColonizeNormally = true;

    if (finalScore >= 80) {
      tier = 'ideal';
      categoryLabel = 'Sehr gut geeignet';
    } else if (finalScore >= 60) {
      tier = 'moderate';
      categoryLabel = 'Gut geeignet';
    } else if (finalScore >= 40) {
      tier = 'harsh';
      categoryLabel = 'Bedingt geeignet';
    } else if (finalScore >= 15) {
      tier = 'hostile';
      categoryLabel = 'Schwer besiedelbar';
    } else {
      tier = 'uninhabitable';
      categoryLabel = 'Für normale Besiedelung ungeeignet';
      canColonizeNormally = false;
    }

    // Summary sentence
    const summary = canColonizeNormally
      ? `Dieser Planet ist ${categoryLabel.toLowerCase()} (Bewohnbarkeit: ${finalScore}%). Kolonisierung ist zulässig.`
      : `Dieser Planet ist für eine normale Besiedelung ungeeignet (Bewohnbarkeit: ${finalScore}%).`;

    return {
      score: finalScore,
      tier,
      categoryLabel,
      factors,
      canColonizeNormally,
      summary,
    };
  }
}
