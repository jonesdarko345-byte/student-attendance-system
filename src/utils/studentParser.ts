/**
 * Universal Student Roster Parser
 * Designed for Ghanaian University (UENR, KNUST, UG, etc.) formats:
 * Supports:
 * - Direct Excel (.xlsx, .xls) file upload & binary extraction
 * - Excel / Google Sheets copy-paste (tab-separated)
 * - CSV (comma-separated, semicolon-separated, pipe-separated)
 * - Space-separated lists (e.g. copied from PDF or web portal)
 * - Serial number prefixes (e.g. 1., #1, 01 -)
 * - Flexible column ordering (Index first, Name first, with or without Stream/Level/Email/Gender)
 */

import * as XLSX from 'xlsx';

export interface ParsedStudentRow {
  name: string;
  indexNumber: string;
  email: string;
  level: string;
  stream: string;
  program: string;
}

export interface ParseResult {
  valid: ParsedStudentRow[];
  skippedHeaders: number;
  invalidLines: { line: string; reason: string }[];
  duplicateCount: number;
}

/**
 * Checks if a token is likely a student index number / registration ID
 */
export function isLikelyIndexNumber(token: string): boolean {
  if (!token) return false;
  const clean = token.trim();

  // Exclude common header / metadata words
  if (
    /^(level|male|female|stream|class|student|index|bachelor|bsc|msc|phd|dept|department|phone|contact|status|regular|fee|paying|admitted|gender|programme|program|year|action|sn|s\/n|no|serial)$/i.test(
      clean
    )
  ) {
    return false;
  }

  // Exclude standalone gender tokens (e.g. M, F, Male, Female)
  if (/^(m|f|male|female)$/i.test(clean)) {
    return false;
  }

  // Exclude Ghanaian phone numbers (e.g. 0244123456, 0501234567, +233244123456)
  const phoneDigits = clean.replace(/[\s\-\(\)\+]/g, '');
  if (/^(?:233|0)(?:20|23|24|25|26|27|28|50|53|54|55|56|57|59)\d{7}$/.test(phoneDigits)) {
    return false;
  }

  // Exclude academic levels (e.g., 100, 200, 300, 400, Level 100, Year 1)
  if (
    /^(level\s*)?(100|200|300|400)$/i.test(clean) ||
    /^L(100|200|300|400)$/i.test(clean) ||
    /^year\s*[1-4]$/i.test(clean)
  ) {
    return false;
  }

  // Exclude single letters (often stream or gender)
  if (/^[a-zA-Z]$/.test(clean)) {
    return false;
  }

  // Pattern 1: Starts with letter prefix (like UEB, UG, KNUST, IT, CS, CE, BIT, BENG) followed by digits/slashes
  // e.g., UEB3100122, UEB/31001/22, UEB-31001-22, IT2022045, CS-2023-11, UG10293847, BSCIT0021, UENR2024100
  if (/^[a-zA-Z]{1,8}[\/\-_]?[0-9]{3,14}[a-zA-Z0-9\/\-_]*$/.test(clean)) {
    return true;
  }

  // Pattern 2: Pure numeric index number (typically 6 to 14 digits)
  // e.g., 0409190012, 3100122, 102938471
  if (/^\d{6,14}$/.test(clean)) {
    return true;
  }

  // Pattern 3: Alphanumeric mix containing at least 3 digits and at least 1 letter, length 5-25
  if (/^(?=.*\d{3,})(?=.*[a-zA-Z])[a-zA-Z0-9\/\-_]{5,25}$/.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Checks if a line is a spreadsheet/table header row
 */
export function isHeaderRow(line: string): boolean {
  const lower = line.toLowerCase();
  const headerKeywords = [
    'index',
    'student name',
    'full name',
    'candidate name',
    'reg no',
    'registration',
    'matriculation',
    'serial no',
    's/n',
    'programme',
    'level',
    'stream',
    'division'
  ];

  return (
    headerKeywords.some((keyword) => lower.includes(keyword)) &&
    (lower.includes('name') || lower.includes('index') || lower.includes('id') || lower.includes('s/n') || lower.includes('reg'))
  );
}

/**
 * Formats names properly (e.g. "ADU BOAHEN KWAKU" -> "Adu Boahen Kwaku", "DARKO, JONES" -> "Darko Jones")
 */
export function formatStudentName(rawName: string): string {
  let cleaned = rawName
    .replace(/^["']|["']$/g, '') // remove surrounding quotes
    .replace(/,\s*/g, ' ') // replace commas inside name (e.g. "Mensah, Kwame" -> "Mensah Kwame")
    .replace(/\s+/g, ' ')
    .trim();

  // If entirely uppercase or entirely lowercase, convert to Title Case
  if (cleaned === cleaned.toUpperCase() || cleaned === cleaned.toLowerCase()) {
    cleaned = cleaned
      .toLowerCase()
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  return cleaned;
}

/**
 * Generates official institutional email from student name:
 * e.g. "Kwame Mensah" -> "kwame.mensah@uenr.edu.gh"
 * e.g. "Samuel Nana Yaw" -> "samuel.nana.yaw@uenr.edu.gh"
 * Falls back to index number or generic slug only if name contains no letters.
 */
export function generateInstitutionalEmail(nameOrIndex: string, indexNumber?: string): string {
  let nameCandidate = nameOrIndex || '';
  let indexCandidate = indexNumber || '';

  // If only one param was provided and it is an index number
  if (!indexNumber && /^[a-zA-Z]{0,4}\d{4,14}/i.test(nameOrIndex.trim())) {
    indexCandidate = nameOrIndex;
    nameCandidate = '';
  }

  if (nameCandidate && nameCandidate.trim()) {
    // Strip common honorifics/prefixes if present
    const stripped = nameCandidate
      .replace(/^(mr|mrs|ms|miss|dr|prof)\.?\s+/i, '')
      .replace(/["']/g, '')
      .replace(/,/g, ' ')
      .trim();

    // Extract alphabetical tokens (names)
    const tokens = stripped
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0 && !['mr', 'mrs', 'ms', 'dr', 'prof'].includes(t));

    if (tokens.length > 0) {
      const emailSlug = tokens.join('.');
      return `${emailSlug}@uenr.edu.gh`;
    }
  }

  // Fallback to index number if name has no letters
  if (indexCandidate && indexCandidate.trim()) {
    const idxSlug = indexCandidate.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (idxSlug) {
      return `${idxSlug}@uenr.edu.gh`;
    }
  }

  return 'student@uenr.edu.gh';
}

export const generateStudentEmail = generateInstitutionalEmail;

/**
 * Main Universal Parser for text input (CSV, TSV, space-separated, copied table)
 */
export function parseStudentRoster(
  rawText: string,
  defaults: {
    defaultLevel?: string;
    defaultStream?: string;
    defaultProgram?: string;
  } = {}
): ParseResult {
  const defaultLevel = defaults.defaultLevel || 'Level 100';
  const defaultStream = defaults.defaultStream || 'IT A';
  const defaultProgram = defaults.defaultProgram || 'BSc Information Technology';

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const valid: ParsedStudentRow[] = [];
  const invalidLines: { line: string; reason: string }[] = [];
  const seenIndexes = new Set<string>();
  let skippedHeaders = 0;
  let duplicateCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // Check if header row
    if (isHeaderRow(rawLine)) {
      skippedHeaders++;
      continue;
    }

    // Strip leading list numbering like "1. ", "01) ", "#1 - ", "1: ", "1\t"
    let cleanLine = rawLine.replace(/^#?\d+[\.\)\-\:\s\t]+\s*/, '').trim();
    if (!cleanLine) continue;

    // Detect delimiter
    let tokens: string[] = [];

    if (cleanLine.includes('\t')) {
      // Tab separated (Excel/Sheets)
      tokens = cleanLine.split('\t').map((t) => t.trim()).filter(Boolean);
    } else if (cleanLine.includes(';') || cleanLine.includes('|')) {
      // Semicolon or pipe separated
      tokens = cleanLine.split(/[;|]+/).map((t) => t.trim()).filter(Boolean);
    } else if (cleanLine.includes(',')) {
      // Comma separated - careful not to split inside quotes
      // Simple regex for CSV tokens
      tokens = cleanLine
        .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
        .map((t) => t.replace(/^["']|["']$/g, '').trim())
        .filter(Boolean);
    } else if (cleanLine.includes(' - ')) {
      // Hyphen separated: "Kwame Mensah - UEB3100122"
      tokens = cleanLine.split(/\s+-\s+/).map((t) => t.trim()).filter(Boolean);
    } else if (/\s{2,}/.test(cleanLine)) {
      // Multi-space separated
      tokens = cleanLine.split(/\s{2,}/).map((t) => t.trim()).filter(Boolean);
    } else {
      // Single space separated: e.g. "UEB3100122 Kwame Mensah" or "Kwame Mensah UEB3100122"
      const spaceParts = cleanLine.split(/\s+/).filter(Boolean);

      if (spaceParts.length >= 2) {
        // Check if first token is index number
        if (isLikelyIndexNumber(spaceParts[0])) {
          const idx = spaceParts[0];
          const name = spaceParts.slice(1).join(' ');
          tokens = [idx, name];
        }
        // Check if last token is index number
        else if (isLikelyIndexNumber(spaceParts[spaceParts.length - 1])) {
          const idx = spaceParts[spaceParts.length - 1];
          const name = spaceParts.slice(0, spaceParts.length - 1).join(' ');
          tokens = [name, idx];
        } else {
          tokens = spaceParts;
        }
      } else {
        tokens = [cleanLine];
      }
    }

    // Process tokens to identify components
    let detectedIndex = '';
    let detectedEmail = '';
    let detectedLevel = '';
    let detectedStream = '';
    let detectedProgram = '';
    const nameTokens: string[] = [];

    for (let t = 0; t < tokens.length; t++) {
      const token = tokens[t].trim();
      if (!token) continue;

      // Skip row numbers if left over at beginning
      if (/^\d{1,4}\.?$/.test(token) && t === 0 && tokens.length > 2) {
        continue;
      }

      // Check and skip gender columns (M, F, Male, Female)
      if (/^(male|female|m|f|gender|sex)$/i.test(token)) {
        continue;
      }

      // Check and skip phone numbers (Ghanaian mobile: 02x, 05x, +233...)
      const digitsOnly = token.replace(/[\s\-\(\)\+]/g, '');
      if (/^(?:233|0)(?:20|23|24|25|26|27|28|50|53|54|55|56|57|59)\d{7}$/.test(digitsOnly)) {
        continue;
      }

      // Check for Email
      if (token.includes('@') && token.includes('.')) {
        detectedEmail = token.toLowerCase();
        continue;
      }

      // Check for Level (e.g. Level 100, 100, Level 200, L100, Year 1)
      if (
        /^(level\s*)?(100|200|300|400)$/i.test(token) ||
        /^L(100|200|300|400)$/i.test(token) ||
        /^year\s*[1-4]$/i.test(token)
      ) {
        const numMatch = token.match(/100|200|300|400/);
        if (numMatch) {
          detectedLevel = `Level ${numMatch[0]}`;
        } else {
          const yrMatch = token.match(/year\s*([1-4])/i);
          if (yrMatch) {
            detectedLevel = `Level ${parseInt(yrMatch[1], 10) * 100}`;
          }
        }
        continue;
      }

      // Check for Stream (e.g. IT A, IT B, Stream A, Division A, Group A)
      if (/^(IT\s*[A-Fa-f]|Stream\s*[A-Fa-f]|Division\s*[A-Fa-f]|Group\s*[A-Fa-f])$/i.test(token)) {
        const letterMatch = token.match(/[A-Fa-f]/i);
        if (letterMatch) {
          detectedStream = `IT ${letterMatch[0].toUpperCase()}`;
        }
        continue;
      }
      if (/^[A-Fa-f]$/i.test(token) && tokens.length >= 3) {
        detectedStream = `IT ${token.toUpperCase()}`;
        continue;
      }

      // Check for Program
      if (/^(BSc|Bachelor|Diploma|Certificate|Computer|IT|Information|Engineering)/i.test(token)) {
        detectedProgram = token;
        continue;
      }

      // Check for Index Number
      if (!detectedIndex && isLikelyIndexNumber(token)) {
        detectedIndex = token.toUpperCase().trim();
        continue;
      }

      // Otherwise, assume it's part of the student's name
      nameTokens.push(token);
    }

    // If index was not found yet, check if any token contains digits and letters
    if (!detectedIndex && nameTokens.length >= 2) {
      for (let n = 0; n < nameTokens.length; n++) {
        if (isLikelyIndexNumber(nameTokens[n])) {
          detectedIndex = nameTokens[n].toUpperCase().trim();
          nameTokens.splice(n, 1);
          break;
        }
      }
    }

    const finalName = formatStudentName(nameTokens.join(' '));

    // Validation
    if (!detectedIndex) {
      invalidLines.push({
        line: rawLine,
        reason: 'Could not detect a valid Index Number (e.g. UEB3100122)'
      });
      continue;
    }

    if (!finalName || finalName.length < 2) {
      invalidLines.push({
        line: rawLine,
        reason: 'Could not detect student name'
      });
      continue;
    }

    // Check for duplicate in current import batch
    const normalizedIdx = detectedIndex.toUpperCase().replace(/[\s\-_]/g, '');
    if (seenIndexes.has(normalizedIdx)) {
      duplicateCount++;
      continue;
    }
    seenIndexes.add(normalizedIdx);

    valid.push({
      name: finalName,
      indexNumber: detectedIndex,
      email: detectedEmail || generateInstitutionalEmail(finalName, detectedIndex),
      level: detectedLevel || defaultLevel,
      stream: detectedStream || defaultStream,
      program: detectedProgram || defaultProgram
    });
  }

  return {
    valid,
    skippedHeaders,
    invalidLines,
    duplicateCount
  };
}

/**
 * Universal File Parser: Supports .xlsx, .xls, .csv, .tsv, .txt
 */
export async function parseUploadedFile(
  file: File,
  defaults: {
    defaultLevel?: string;
    defaultStream?: string;
    defaultProgram?: string;
  } = {}
): Promise<{ text: string; result: ParseResult }> {
  const fileName = file.name.toLowerCase();
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

  if (isExcel) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Use the first worksheet
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error('Excel workbook contains no sheets.');
    }
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert sheet to array of rows (each row is an array of cell values)
    const rawRows = XLSX.utils.sheet_to_json<(string | number)[]>(worksheet, {
      header: 1,
      blankrows: false,
      raw: false
    });

    // Format rows into tab-separated text for consistent universal parsing
    const textLines: string[] = [];
    for (const row of rawRows) {
      if (!Array.isArray(row)) continue;
      const cells = row.map((cell) => (cell !== null && cell !== undefined ? String(cell).trim() : ''));
      // Only keep rows that have at least one non-empty cell
      if (cells.some((c) => c.length > 0)) {
        textLines.push(cells.join('\t'));
      }
    }

    const fullText = textLines.join('\n');
    const result = parseStudentRoster(fullText, defaults);
    return { text: fullText, result };
  } else {
    // CSV, TSV, or TXT file
    const text = await file.text();
    const result = parseStudentRoster(text, defaults);
    return { text, result };
  }
}

/**
 * Generate realistic Ghanaian university students for instant 1-click testing
 */
export function generateSampleStudents(count = 100, defaultStream = 'IT A'): string {
  const firstNames = [
    'Kwame', 'Ama', 'Kofi', 'Akua', 'Yaw', 'Yaa', 'Kwaku', 'Afia', 'Kwabena', 'Abena',
    'Emmanuel', 'Grace', 'Samuel', 'Priscilla', 'Daniel', 'Eunice', 'Michael', 'Ruth',
    'David', 'Esther', 'Joseph', 'Hannah', 'Prince', 'Blessing', 'Frank', 'Patience',
    'Bright', 'Peace', 'Richard', 'Gloria', 'Richmond', 'Mercy', 'Justice', 'Comfort',
    'Felix', 'Victoria', 'George', 'Doreen', 'Francis', 'Bernice', 'Gideon', 'Emmanuella'
  ];

  const lastNames = [
    'Mensah', 'Serwaa', 'Osei', 'Appiah', 'Boateng', 'Agyemang', 'Antwi', 'Darko',
    'Owusu', 'Frimpong', 'Asante', 'Boakye', 'Sarpong', 'Adjei', 'Kyeremeh', 'Acheampong',
    'Baffour', 'Twumasi', 'Danquah', 'Amponsah', 'Gyasi', 'Amoah', 'Opoku', 'Agyei',
    'Kwarteng', 'Gyamfi', 'Donkor', 'Fosu', 'Baah', 'Yeboah', 'Addai', 'Anane'
  ];

  const rows: string[] = [];
  for (let i = 1; i <= count; i++) {
    const fn = firstNames[(i * 7) % firstNames.length];
    const ln = lastNames[(i * 11) % lastNames.length];
    const padNum = String(1000 + i).padStart(5, '0');
    const indexNumber = `UEB31${padNum}22`;
    rows.push(`${fn} ${ln}, ${indexNumber}, ${defaultStream}`);
  }

  return rows.join('\n');
}
