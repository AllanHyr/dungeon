// ============================================================
//  index.js — La "vitrine" du cœur du jeu
// ============================================================
// Tout ce que l'interface (ou un futur serveur) a le droit d'utiliser.

export { buildContent, getModeParams, availableTranches, dungeonsOf, dungeonIdOf, dungeonRules, DATA_FILES, EQUIP_SLOTS, ITEM_TYPES, FEATURES, FX_VOCAB } from './content.js';
export { createRun, createTraining, createFarm, dispatch, restoreState, cloneState, attachContent, STATE_VERSION } from './engine.js';
export { applyFarmResult, openChest, chestInfo, canStartFarm, waveInfo, farmZone } from './farm.js';
export {
  checkAchievements, achievementProgress, achievementsFor, hasFeature, achievementForFeature, titlesOf, rewardTexts, gearLevel, isUnlocked
} from './achievements.js';
export { applyRunResult, newItemsOf, contribution } from './results.js';
export {
  createCharacter, newCharacterStats, addXp, addXpCapped, previewXpCapped, xpForNext, levelCap, previewXp, skillPointsFree, skillPointsSpent,
  skillPointsToSpend, canLearnSkill, choiceMate, skillRequirements, learnSkill, resetSkills, levelFactor, trancheTopLevel,
  deckSize, specLevel, pendingChoices, specsOf, deckEligible, pruneDeck, fillDeck, setSpec, setDeck, autoSkillIds, knownSkills
} from './progression.js';
export { computeStats, unitStats, effectiveLevel, itemIsActive, skillIsActive, skillAvailable, evalCondition, describeStats, calcDamage, auraSources, activeSets } from './stats.js';
export { getCombatView } from './combat.js';
export {
  skillOf, activeSkillIds, skillGroup, skillPaCost, checkUsable, checkUsable as skillUsable, validTargets, needsPick, needsModePick, modeOptions, resolveDice, skillWorksOutside
} from './skills.js';
export { canEquip, slotsFor, planEquip, equipFromBag, unequipToBag, wornFor, twoHandedWorn, itemPrice, itemSummary, itemDef, rarityOf } from './items.js';
export { shopPrice } from './tiles.js';
export { sellPrice } from './inventory.js';
export { canBeRevived, canBeRaised, totalShield } from './units.js';
export { unitById, otherRow } from './geometry.js';
export { applyCharacterAction, CHARACTER_ACTIONS, MAX_CHARACTERS, characterSlots, cleanName } from './profile-actions.js';
export { settleRun } from './settle.js';
export { afkAction, whoMustAct, turnKey } from './autopilot.js';
