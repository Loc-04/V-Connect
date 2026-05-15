import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FE_INTEREST_CATALOG_PATH = path.resolve(__dirname, '../../../web-app/src/lib/interestCatalog.ts');
const DB_INTEREST_COLUMNS = ['interest_name', 'name', 'label'];

function normalizeInterest(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function uniqueCanonicalInterests(values) {
  const output = [];
  const seen = new Set();
  for (const item of values) {
    const normalized = String(item ?? '').trim().replace(/\s+/g, ' ');
    if (!normalized) {
      continue;
    }
    const key = normalizeInterest(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
  }
  return output;
}

function readFeInterestCatalog() {
  if (!fs.existsSync(FE_INTEREST_CATALOG_PATH)) {
    return {
      source: 'fe_interest_catalog',
      path: FE_INTEREST_CATALOG_PATH,
      found: false,
      interests: [],
      error: 'file_not_found',
    };
  }

  const content = fs.readFileSync(FE_INTEREST_CATALOG_PATH, 'utf8');
  const blockMatch = content.match(/const\s+sharedInterestCatalog\s*=\s*\[([\s\S]*?)\]\s*as const/);
  if (!blockMatch) {
    return {
      source: 'fe_interest_catalog',
      path: FE_INTEREST_CATALOG_PATH,
      found: false,
      interests: [],
      error: 'shared_interest_catalog_block_not_found',
    };
  }

  const values = [];
  const literalRegex = /'([^']+)'|"([^"]+)"/g;
  let match = literalRegex.exec(blockMatch[1]);
  while (match) {
    values.push(match[1] ?? match[2] ?? '');
    match = literalRegex.exec(blockMatch[1]);
  }

  const interests = uniqueCanonicalInterests(values);
  return {
    source: 'fe_interest_catalog',
    path: FE_INTEREST_CATALOG_PATH,
    found: interests.length > 0,
    interests,
    error: interests.length > 0 ? null : 'empty_catalog',
  };
}

async function readDbInterestCatalog(supabaseAdmin) {
  for (const column of DB_INTEREST_COLUMNS) {
    const { data, error } = await supabaseAdmin.from('core_interests').select(column).limit(5000);
    if (error) {
      continue;
    }
    const interests = uniqueCanonicalInterests((data ?? []).map((row) => row?.[column]));
    return {
      source: 'db_core_interests',
      found: interests.length > 0,
      interests,
      column,
      error: interests.length > 0 ? null : 'empty_catalog',
    };
  }
  return {
    source: 'db_core_interests',
    found: false,
    interests: [],
    column: null,
    error: 'table_or_supported_columns_not_found',
  };
}

function diffCatalogs(left, right) {
  const leftSet = new Set(left.map((item) => normalizeInterest(item)));
  const rightSet = new Set(right.map((item) => normalizeInterest(item)));
  const onlyInLeft = left.filter((item) => !rightSet.has(normalizeInterest(item)));
  const onlyInRight = right.filter((item) => !leftSet.has(normalizeInterest(item)));
  return {
    only_in_left: uniqueCanonicalInterests(onlyInLeft),
    only_in_right: uniqueCanonicalInterests(onlyInRight),
  };
}

async function resolveInterestCatalogSource(supabaseAdmin, options = {}) {
  const preferDbWhenAvailable = options.preferDbWhenAvailable !== false;
  const fe = readFeInterestCatalog();
  const db = await readDbInterestCatalog(supabaseAdmin);

  const mismatch =
    fe.interests.length > 0 && db.interests.length > 0 ? diffCatalogs(fe.interests, db.interests) : null;
  const hasMismatch =
    Boolean(mismatch) &&
    ((mismatch?.only_in_left?.length ?? 0) > 0 || (mismatch?.only_in_right?.length ?? 0) > 0);

  let selectedSource = null;
  let selectedCatalog = [];

  if (db.found && preferDbWhenAvailable) {
    selectedSource = 'db_core_interests';
    selectedCatalog = db.interests;
  } else if (fe.found) {
    selectedSource = 'fe_interest_catalog';
    selectedCatalog = fe.interests;
  } else if (db.found) {
    selectedSource = 'db_core_interests';
    selectedCatalog = db.interests;
  }

  if (!selectedSource || selectedCatalog.length === 0) {
    throw new Error(
      `Unable to resolve interest catalog source. fe_found=${fe.found}, db_found=${db.found}, fe_error=${fe.error}, db_error=${db.error}`
    );
  }

  return {
    selected_source: selectedSource,
    selected_catalog: selectedCatalog,
    selected_count: selectedCatalog.length,
    fe_catalog: fe,
    db_catalog: db,
    fe_db_mismatch: {
      has_mismatch: hasMismatch,
      only_in_fe: mismatch?.only_in_left ?? [],
      only_in_db: mismatch?.only_in_right ?? [],
    },
  };
}

function findOutOfCatalogInterests(interests, catalog) {
  const catalogSet = new Set(catalog.map((item) => normalizeInterest(item)));
  return uniqueCanonicalInterests(interests).filter((item) => !catalogSet.has(normalizeInterest(item)));
}

export {
  FE_INTEREST_CATALOG_PATH,
  findOutOfCatalogInterests,
  normalizeInterest,
  resolveInterestCatalogSource,
  uniqueCanonicalInterests,
};
