// ════════════════════════════════════════════
// Tabatha — Category Service (Plan 023 Task 03)
// Owns user-defined category management on top of BUILT_IN_CATEGORIES.
// ════════════════════════════════════════════

import { getCategories, setStorage } from './storageService.js';

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_CATEGORIES':
      return { categories: await getCategories() };

    case 'CREATE_CATEGORY':
      return { categories: await createCategory(message.id, message.data) };

    case 'CLONE_CATEGORY':
      return { categories: await cloneCategory(message.sourceId, message.newId, message.overrides) };

    default:
      return undefined;
  }
}

async function createCategory(id, categoryData) {
  const categories = await getCategories();
  categories[id] = {
    builtIn: false,
    ...categoryData
  };
  await setStorage({ categories });
  return categories;
}

async function cloneCategory(sourceId, newId, overrides = {}) {
  const categories = await getCategories();
  const source = categories[sourceId];
  if (!source) return null;

  const cloned = {
    ...JSON.parse(JSON.stringify(source)),
    builtIn: false,
    clonedFrom: sourceId,
    name: overrides.name || `${source.name} (Copy)`,
    ...overrides
  };

  categories[newId] = cloned;
  await setStorage({ categories });
  return categories;
}
