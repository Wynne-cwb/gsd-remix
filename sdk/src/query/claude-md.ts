/**
 * claude-md.ts — CLAUDE.md generation (managed sections).
 *
 * Extracted from profile-output.ts when the profiling pipeline was removed.
 * Registers the `generate-claude-md` query handler: full CLAUDE.md with
 * managed sections (project, stack, conventions, architecture, skills,
 * workflow enforcement).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

import { loadConfig } from '../config.js';
import type { QueryHandler } from './utils.js';

const CLAUDE_MD_FALLBACKS = {
  project: 'Project not yet initialized. Run /gsd-new-project to set up.',
  stack: 'Technology stack not yet documented. Will populate after codebase mapping or first phase.',
  conventions: 'Conventions not yet established. Will populate as patterns emerge during development.',
  architecture: 'Architecture not yet mapped. Follow existing patterns found in the codebase.',
  skills:
    'No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.',
};

const SKILL_SEARCH_DIRS = ['.claude/skills', '.agents/skills', '.cursor/skills', '.github/skills', '.codex/skills'];

const CLAUDE_MD_WORKFLOW_ENFORCEMENT = [
  'Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.',
  '',
  'Use these entry points:',
  '- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks',
  '- `/gsd-debug` for investigation and bug fixing',
  '- `/gsd-execute-phase` for planned phase work',
  '',
  'Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.',
].join('\n');

function safeReadFile(filePath: string): string | null {
  try {
    return existsSync(filePath) ? readFileSync(filePath, 'utf-8') : null;
  } catch {
    return null;
  }
}

function extractMarkdownSection(content: string, sectionName: string): string | null {
  if (!content) return null;
  const lines = content.split('\n');
  let capturing = false;
  const result: string[] = [];
  const headingPattern = new RegExp(`^## ${sectionName}\\s*$`);
  for (const line of lines) {
    if (headingPattern.test(line)) {
      capturing = true;
      result.push(line);
      continue;
    }
    if (capturing && /^## /.test(line)) break;
    if (capturing) result.push(line);
  }
  return result.length > 0 ? result.join('\n').trim() : null;
}

function extractSectionContent(fileContent: string, sectionName: string): string | null {
  const startMarker = `<!-- GSD:${sectionName}-start`;
  const endMarker = `<!-- GSD:${sectionName}-end -->`;
  const startIdx = fileContent.indexOf(startMarker);
  const endIdx = fileContent.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return null;
  const startTagEnd = fileContent.indexOf('-->', startIdx);
  if (startTagEnd === -1) return null;
  return fileContent.substring(startTagEnd + 3, endIdx);
}

function buildSection(sectionName: string, sourceFile: string, content: string): string {
  return [`<!-- GSD:${sectionName}-start source:${sourceFile} -->`, content, `<!-- GSD:${sectionName}-end -->`].join('\n');
}

function updateSection(
  fileContent: string,
  sectionName: string,
  newContent: string,
): { content: string; action: string } {
  const startMarker = `<!-- GSD:${sectionName}-start`;
  const endMarker = `<!-- GSD:${sectionName}-end -->`;
  const startIdx = fileContent.indexOf(startMarker);
  const endIdx = fileContent.indexOf(endMarker);
  if (startIdx !== -1 && endIdx !== -1) {
    const before = fileContent.substring(0, startIdx);
    const after = fileContent.substring(endIdx + endMarker.length);
    return { content: before + newContent + after, action: 'replaced' };
  }
  return { content: fileContent.trimEnd() + '\n\n' + newContent + '\n', action: 'appended' };
}

function detectManualEdit(fileContent: string, sectionName: string, expectedContent: string): boolean {
  const currentContent = extractSectionContent(fileContent, sectionName);
  if (currentContent === null) return false;
  const normalize = (s: string) => s.trim().replace(/\n{3,}/g, '\n\n');
  return normalize(currentContent) !== normalize(expectedContent);
}

function generateProjectSection(cwd: string): { content: string; source: string; hasFallback: boolean } {
  const projectPath = join(cwd, '.planning', 'PROJECT.md');
  const content = safeReadFile(projectPath);
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.project, source: 'PROJECT.md', hasFallback: true };
  }
  const parts: string[] = [];
  const h1Match = content.match(/^# (.+)$/m);
  if (h1Match) parts.push(`**${h1Match[1]}**`);
  const whatThisIs = extractMarkdownSection(content, 'What This Is');
  if (whatThisIs) {
    const body = whatThisIs.replace(/^## What This Is\s*/i, '').trim();
    if (body) parts.push(body);
  }
  const coreValue = extractMarkdownSection(content, 'Core Value');
  if (coreValue) {
    const body = coreValue.replace(/^## Core Value\s*/i, '').trim();
    if (body) parts.push(`**Core Value:** ${body}`);
  }
  const constraints = extractMarkdownSection(content, 'Constraints');
  if (constraints) {
    const body = constraints.replace(/^## Constraints\s*/i, '').trim();
    if (body) parts.push(`### Constraints\n\n${body}`);
  }
  if (parts.length === 0) {
    return { content: CLAUDE_MD_FALLBACKS.project, source: 'PROJECT.md', hasFallback: true };
  }
  return { content: parts.join('\n\n'), source: 'PROJECT.md', hasFallback: false };
}

function generateStackSection(cwd: string): { content: string; source: string; hasFallback: boolean } {
  const codebasePath = join(cwd, '.planning', 'codebase', 'STACK.md');
  const researchPath = join(cwd, '.planning', 'research', 'STACK.md');
  let content = safeReadFile(codebasePath);
  let source = 'codebase/STACK.md';
  if (!content) {
    content = safeReadFile(researchPath);
    source = 'research/STACK.md';
  }
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.stack, source: 'STACK.md', hasFallback: true };
  }
  const lines = content.split('\n');
  const summaryLines: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (!line.startsWith('# ') || summaryLines.length > 0) summaryLines.push(line);
      continue;
    }
    if (line.startsWith('|')) {
      inTable = true;
      summaryLines.push(line);
      continue;
    }
    if (inTable && line.trim() === '') inTable = false;
    if (line.startsWith('- ') || line.startsWith('* ')) summaryLines.push(line);
  }
  const summary = summaryLines.length > 0 ? summaryLines.join('\n') : content.trim();
  return { content: summary, source, hasFallback: false };
}

function generateConventionsSection(cwd: string): { content: string; source: string; hasFallback: boolean } {
  const conventionsPath = join(cwd, '.planning', 'codebase', 'CONVENTIONS.md');
  const content = safeReadFile(conventionsPath);
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.conventions, source: 'CONVENTIONS.md', hasFallback: true };
  }
  const lines = content.split('\n');
  const summaryLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (!line.startsWith('# ')) summaryLines.push(line);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('|')) summaryLines.push(line);
  }
  const summary = summaryLines.length > 0 ? summaryLines.join('\n') : content.trim();
  return { content: summary, source: 'CONVENTIONS.md', hasFallback: false };
}

function generateArchitectureSection(cwd: string): { content: string; source: string; hasFallback: boolean } {
  const architecturePath = join(cwd, '.planning', 'codebase', 'ARCHITECTURE.md');
  const content = safeReadFile(architecturePath);
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.architecture, source: 'ARCHITECTURE.md', hasFallback: true };
  }
  const lines = content.split('\n');
  const summaryLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (!line.startsWith('# ')) summaryLines.push(line);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('|') || line.startsWith('```')) {
      summaryLines.push(line);
    }
  }
  const summary = summaryLines.length > 0 ? summaryLines.join('\n') : content.trim();
  return { content: summary, source: 'ARCHITECTURE.md', hasFallback: false };
}

function generateWorkflowSection(): { content: string; source: string; hasFallback: boolean } {
  return { content: CLAUDE_MD_WORKFLOW_ENFORCEMENT, source: 'GSD defaults', hasFallback: false };
}

function extractSkillFrontmatter(content: string): { name: string; description: string } {
  const result = { name: '', description: '' };
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return result;

  const fmBlock = fmMatch[1]!;
  const lines = fmBlock.split('\n');

  let currentKey = '';
  for (const line of lines) {
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1]!;
      const value = kvMatch[2]!.trim();
      if (currentKey === 'name') result.name = value;
      if (currentKey === 'description') result.description = value;
      continue;
    }
    if (currentKey === 'description' && /^\s+/.test(line)) {
      result.description += ` ${line.trim()}`;
    } else {
      currentKey = '';
    }
  }

  return result;
}

function generateSkillsSection(cwd: string): { content: string; source: string; hasFallback: boolean } {
  const discovered: Array<{ name: string; description: string; path: string }> = [];

  for (const dir of SKILL_SEARCH_DIRS) {
    const absDir = join(cwd, dir);
    if (!existsSync(absDir)) continue;

    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('gsd-')) continue;

      const skillMdPath = join(absDir, entry.name, 'SKILL.md');
      if (!existsSync(skillMdPath)) continue;

      const content = safeReadFile(skillMdPath);
      if (!content) continue;

      const frontmatter = extractSkillFrontmatter(content);
      const name = frontmatter.name || entry.name;
      const description = frontmatter.description || '';

      if (discovered.some((s) => s.name === name)) continue;

      discovered.push({ name, description, path: `${dir}/${entry.name}` });
    }
  }

  if (discovered.length === 0) {
    return { content: CLAUDE_MD_FALLBACKS.skills, source: 'skills/', hasFallback: true };
  }

  const lines = ['| Skill | Description | Path |', '|-------|-------------|------|'];
  for (const skill of discovered) {
    const desc = skill.description.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    const safeName = skill.name.replace(/\|/g, '\\|');
    lines.push(`| ${safeName} | ${desc} | \`${skill.path}/SKILL.md\` |`);
  }

  return { content: lines.join('\n'), source: 'skills/', hasFallback: false };
}

export const generateClaudeMd: QueryHandler = async (args, projectDir) => {
  const outputIdx = args.indexOf('--output');
  const outputPathOpt = outputIdx >= 0 ? args[outputIdx + 1] : null;
  const autoFlag = args.includes('--auto');

  const MANAGED_SECTIONS = ['project', 'stack', 'conventions', 'architecture', 'skills', 'workflow'] as const;
  const generators: Record<
    (typeof MANAGED_SECTIONS)[number],
    (cwd: string) => { content: string; source: string; hasFallback: boolean }
  > = {
    project: generateProjectSection,
    stack: generateStackSection,
    conventions: generateConventionsSection,
    architecture: generateArchitectureSection,
    skills: generateSkillsSection,
    workflow: () => generateWorkflowSection(),
  };
  const sectionHeadings: Record<(typeof MANAGED_SECTIONS)[number], string> = {
    project: '## Project',
    stack: '## Technology Stack',
    conventions: '## Conventions',
    architecture: '## Architecture',
    skills: '## Project Skills',
    workflow: '## GSD Workflow Enforcement',
  };

  const generated: Record<
    string,
    { content: string; source: string; hasFallback: boolean }
  > = {};
  const sectionsGenerated: string[] = [];
  const sectionsFallback: string[] = [];
  const sectionsSkipped: string[] = [];

  for (const name of MANAGED_SECTIONS) {
    const gen = generators[name](projectDir);
    generated[name] = gen;
    if (gen.hasFallback) {
      sectionsFallback.push(name);
    } else {
      sectionsGenerated.push(name);
    }
  }

  let outputPath: string;
  if (!outputPathOpt) {
    let configClaudeMdPath = './CLAUDE.md';
    try {
      const config = await loadConfig(projectDir);
      const p = config.claude_md_path;
      if (typeof p === 'string' && p) configClaudeMdPath = p;
    } catch {
      /* default */
    }
    outputPath = isAbsolute(configClaudeMdPath)
      ? configClaudeMdPath
      : join(projectDir, configClaudeMdPath);
  } else if (!isAbsolute(outputPathOpt)) {
    outputPath = join(projectDir, outputPathOpt);
  } else {
    outputPath = outputPathOpt;
  }

  let existingContent = safeReadFile(outputPath);
  let action: string;

  if (existingContent === null) {
    const sections: string[] = [];
    for (const name of MANAGED_SECTIONS) {
      const gen = generated[name]!;
      const heading = sectionHeadings[name];
      const body = `${heading}\n\n${gen.content}`;
      sections.push(buildSection(name, gen.source, body));
    }
    existingContent = `${sections.join('\n\n')}\n`;
    action = 'created';
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, existingContent, 'utf-8');
  } else {
    action = 'updated';
    let fileContent = existingContent;

    for (const name of MANAGED_SECTIONS) {
      const gen = generated[name]!;
      const heading = sectionHeadings[name];
      const body = `${heading}\n\n${gen.content}`;
      const fullSection = buildSection(name, gen.source, body);
      const hasMarkers = fileContent.indexOf(`<!-- GSD:${name}-start`) !== -1;

      if (hasMarkers) {
        if (autoFlag) {
          const expectedBody = `${heading}\n\n${gen.content}`;
          if (detectManualEdit(fileContent, name, expectedBody)) {
            sectionsSkipped.push(name);
            const genIdx = sectionsGenerated.indexOf(name);
            if (genIdx !== -1) sectionsGenerated.splice(genIdx, 1);
            const fbIdx = sectionsFallback.indexOf(name);
            if (fbIdx !== -1) sectionsFallback.splice(fbIdx, 1);
            continue;
          }
        }
        const result = updateSection(fileContent, name, fullSection);
        fileContent = result.content;
      } else {
        const result = updateSection(fileContent, name, fullSection);
        fileContent = result.content;
      }
    }


    writeFileSync(outputPath, fileContent, 'utf-8');
  }

  const genCount = sectionsGenerated.length;
  const totalManaged = MANAGED_SECTIONS.length;
  let message = `Generated ${genCount}/${totalManaged} sections.`;
  if (sectionsFallback.length > 0) message += ` Fallback: ${sectionsFallback.join(', ')}.`;
  if (sectionsSkipped.length > 0) message += ` Skipped (manually edited): ${sectionsSkipped.join(', ')}.`;

  return {
    data: {
      claude_md_path: outputPath,
      action,
      sections_generated: sectionsGenerated,
      sections_fallback: sectionsFallback,
      sections_skipped: sectionsSkipped,
      sections_total: totalManaged,
      message,
    },
  };
};
