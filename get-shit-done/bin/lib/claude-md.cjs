/**
 * claude-md.cjs — CLAUDE.md generation (managed sections).
 *
 * Extracted from profile-output.cjs when the profiling pipeline was removed.
 * Provides:
 *   - generate-claude-md: full CLAUDE.md with managed sections
 *     (project, stack, conventions, architecture, skills, workflow enforcement)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { output, safeReadFile, loadConfig } = require('./core.cjs');

const CLAUDE_MD_FALLBACKS = {
  project: 'Project not yet initialized. Run /gsd-new-project to set up.',
  stack: 'Technology stack not yet documented. Will populate after codebase mapping or first phase.',
  conventions: 'Conventions not yet established. Will populate as patterns emerge during development.',
  architecture: 'Architecture not yet mapped. Follow existing patterns found in the codebase.',
  skills: 'No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.',
};

// Directories where project skills may live (checked in order)
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

// ─── Helper Functions ─────────────────────────────────────────────────────────

function extractSectionContent(fileContent, sectionName) {
  const startMarker = `<!-- GSD:${sectionName}-start`;
  const endMarker = `<!-- GSD:${sectionName}-end -->`;
  const startIdx = fileContent.indexOf(startMarker);
  const endIdx = fileContent.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) return null;
  const startTagEnd = fileContent.indexOf('-->', startIdx);
  if (startTagEnd === -1) return null;
  return fileContent.substring(startTagEnd + 3, endIdx);
}

function buildSection(sectionName, sourceFile, content) {
  return [
    `<!-- GSD:${sectionName}-start source:${sourceFile} -->`,
    content,
    `<!-- GSD:${sectionName}-end -->`,
  ].join('\n');
}

function updateSection(fileContent, sectionName, newContent) {
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

function detectManualEdit(fileContent, sectionName, expectedContent) {
  const currentContent = extractSectionContent(fileContent, sectionName);
  if (currentContent === null) return false;
  const normalize = (s) => s.trim().replace(/\n{3,}/g, '\n\n');
  return normalize(currentContent) !== normalize(expectedContent);
}

function extractMarkdownSection(content, sectionName) {
  if (!content) return null;
  const lines = content.split('\n');
  let capturing = false;
  const result = [];
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

// ─── CLAUDE.md Section Generators ─────────────────────────────────────────────

function generateProjectSection(cwd) {
  const projectPath = path.join(cwd, '.planning', 'PROJECT.md');
  const content = safeReadFile(projectPath);
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.project, source: 'PROJECT.md', linkPath: null, hasFallback: true };
  }
  const parts = [];
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
    return { content: CLAUDE_MD_FALLBACKS.project, source: 'PROJECT.md', linkPath: null, hasFallback: true };
  }
  return { content: parts.join('\n\n'), source: 'PROJECT.md', linkPath: '.planning/PROJECT.md', hasFallback: false };
}

function generateStackSection(cwd) {
  const codebasePath = path.join(cwd, '.planning', 'codebase', 'STACK.md');
  const researchPath = path.join(cwd, '.planning', 'research', 'STACK.md');
  let content = safeReadFile(codebasePath);
  let source = 'codebase/STACK.md';
  let linkPath = '.planning/codebase/STACK.md';
  if (!content) {
    content = safeReadFile(researchPath);
    source = 'research/STACK.md';
    linkPath = '.planning/research/STACK.md';
  }
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.stack, source: 'STACK.md', linkPath: null, hasFallback: true };
  }
  const lines = content.split('\n');
  const summaryLines = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (!line.startsWith('# ') || summaryLines.length > 0) summaryLines.push(line);
      continue;
    }
    if (line.startsWith('|')) { inTable = true; summaryLines.push(line); continue; }
    if (inTable && line.trim() === '') inTable = false;
    if (line.startsWith('- ') || line.startsWith('* ')) summaryLines.push(line);
  }
  const summary = summaryLines.length > 0 ? summaryLines.join('\n') : content.trim();
  return { content: summary, source, linkPath, hasFallback: false };
}

function generateConventionsSection(cwd) {
  const conventionsPath = path.join(cwd, '.planning', 'codebase', 'CONVENTIONS.md');
  const content = safeReadFile(conventionsPath);
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.conventions, source: 'CONVENTIONS.md', linkPath: null, hasFallback: true };
  }
  const lines = content.split('\n');
  const summaryLines = [];
  for (const line of lines) {
    if (line.startsWith('#')) { if (!line.startsWith('# ')) summaryLines.push(line); continue; }
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('|')) summaryLines.push(line);
  }
  const summary = summaryLines.length > 0 ? summaryLines.join('\n') : content.trim();
  return { content: summary, source: 'CONVENTIONS.md', linkPath: '.planning/codebase/CONVENTIONS.md', hasFallback: false };
}

function generateArchitectureSection(cwd) {
  const architecturePath = path.join(cwd, '.planning', 'codebase', 'ARCHITECTURE.md');
  const content = safeReadFile(architecturePath);
  if (!content) {
    return { content: CLAUDE_MD_FALLBACKS.architecture, source: 'ARCHITECTURE.md', linkPath: null, hasFallback: true };
  }
  const lines = content.split('\n');
  const summaryLines = [];
  for (const line of lines) {
    if (line.startsWith('#')) { if (!line.startsWith('# ')) summaryLines.push(line); continue; }
    if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('|') || line.startsWith('```')) summaryLines.push(line);
  }
  const summary = summaryLines.length > 0 ? summaryLines.join('\n') : content.trim();
  return { content: summary, source: 'ARCHITECTURE.md', linkPath: '.planning/codebase/ARCHITECTURE.md', hasFallback: false };
}

function generateWorkflowSection() {
  return {
    content: CLAUDE_MD_WORKFLOW_ENFORCEMENT,
    source: 'GSD defaults',
    linkPath: null,
    hasFallback: false,
  };
}

/**
 * Discover project skills from standard directories and extract frontmatter
 * (name + description) for each. Returns a table summary for CLAUDE.md so
 * agents know which skills are available at session startup (Layer 1 discovery).
 */
function generateSkillsSection(cwd) {
  const discovered = [];

  for (const dir of SKILL_SEARCH_DIRS) {
    const absDir = path.join(cwd, dir);
    if (!fs.existsSync(absDir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // Skip GSD's own installed skills — only surface project-specific skills
      if (entry.name.startsWith('gsd-')) continue;

      const skillMdPath = path.join(absDir, entry.name, 'SKILL.md');
      if (!fs.existsSync(skillMdPath)) continue;

      const content = safeReadFile(skillMdPath);
      if (!content) continue;

      const frontmatter = extractSkillFrontmatter(content);
      const name = frontmatter.name || entry.name;
      const description = frontmatter.description || '';

      // Avoid duplicates when same skill dir is symlinked from multiple locations
      if (discovered.some(s => s.name === name)) continue;

      discovered.push({ name, description, path: `${dir}/${entry.name}` });
    }
  }

  if (discovered.length === 0) {
    return { content: CLAUDE_MD_FALLBACKS.skills, source: 'skills/', hasFallback: true };
  }

  const lines = ['| Skill | Description | Path |', '|-------|-------------|------|'];
  for (const skill of discovered) {
    // Sanitize table cell content (escape pipes)
    const desc = skill.description.replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
    const safeName = skill.name.replace(/\|/g, '\\|');
    lines.push(`| ${safeName} | ${desc} | \`${skill.path}/SKILL.md\` |`);
  }

  return { content: lines.join('\n'), source: 'skills/', hasFallback: false };
}

/**
 * Extract name and description from YAML-like frontmatter in a SKILL.md file.
 * Handles multi-line description values (continuation lines indented with spaces).
 */
function extractSkillFrontmatter(content) {
  const result = { name: '', description: '' };
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!fmMatch) return result;

  const fmBlock = fmMatch[1];
  const lines = fmBlock.split('\n');

  let currentKey = '';
  for (const line of lines) {
    // Top-level key: value
    const kvMatch = line.match(/^(\w[\w-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();
      if (currentKey === 'name') result.name = value;
      if (currentKey === 'description') result.description = value;
      continue;
    }
    // Continuation line (indented) for multi-line values
    if (currentKey === 'description' && /^\s+/.test(line)) {
      result.description += ' ' + line.trim();
    } else {
      currentKey = '';
    }
  }

  return result;
}

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdGenerateClaudeMd(cwd, options, raw) {
  const MANAGED_SECTIONS = ['project', 'stack', 'conventions', 'architecture', 'skills', 'workflow'];
  const generators = {
    project: generateProjectSection,
    stack: generateStackSection,
    conventions: generateConventionsSection,
    architecture: generateArchitectureSection,
    skills: generateSkillsSection,
    workflow: generateWorkflowSection,
  };
  const sectionHeadings = {
    project: '## Project',
    stack: '## Technology Stack',
    conventions: '## Conventions',
    architecture: '## Architecture',
    skills: '## Project Skills',
    workflow: '## GSD Workflow Enforcement',
  };

  const generated = {};
  const sectionsGenerated = [];
  const sectionsFallback = [];
  const sectionsSkipped = [];

  for (const name of MANAGED_SECTIONS) {
    const gen = generators[name](cwd);
    generated[name] = gen;
    if (gen.hasFallback) {
      sectionsFallback.push(name);
    } else {
      sectionsGenerated.push(name);
    }
  }

  let assemblyConfig = {};
  let configClaudeMdPath = './CLAUDE.md';
  try {
    const config = loadConfig(cwd);
    if (config.claude_md_path) configClaudeMdPath = config.claude_md_path;
    if (config.claude_md_assembly) assemblyConfig = config.claude_md_assembly;
  } catch { /* use default */ }

  let outputPath = options.output;
  if (!outputPath) {
    outputPath = path.isAbsolute(configClaudeMdPath) ? configClaudeMdPath : path.join(cwd, configClaudeMdPath);
  } else if (!path.isAbsolute(outputPath)) {
    outputPath = path.join(cwd, outputPath);
  }

  const globalAssemblyMode = assemblyConfig.mode || 'embed';
  const blockModes = assemblyConfig.blocks || {};

  // Return the assembled content for a section, respecting link vs embed mode.
  // "link" mode writes `@<linkPath>` when the generator has a real source file.
  // Falls back to "embed" for sections without a linkable source (workflow, fallbacks).
  function buildSectionContent(name, gen, heading) {
    const effectiveMode = blockModes[name] || globalAssemblyMode;
    if (effectiveMode === 'link' && gen.linkPath && !gen.hasFallback) {
      return buildSection(name, gen.source, `${heading}\n\n@${gen.linkPath}`);
    }
    return buildSection(name, gen.source, `${heading}\n\n${gen.content}`);
  }

  let existingContent = safeReadFile(outputPath);
  let action;

  if (existingContent === null) {
    const sections = [];
    for (const name of MANAGED_SECTIONS) {
      const gen = generated[name];
      const heading = sectionHeadings[name];
      sections.push(buildSectionContent(name, gen, heading));
    }
    existingContent = sections.join('\n\n') + '\n';
    action = 'created';
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, existingContent, 'utf-8');
  } else {
    action = 'updated';
    let fileContent = existingContent;

    for (const name of MANAGED_SECTIONS) {
      const gen = generated[name];
      const heading = sectionHeadings[name];
      const fullSection = buildSectionContent(name, gen, heading);
      const hasMarkers = fileContent.indexOf(`<!-- GSD:${name}-start`) !== -1;

      if (hasMarkers) {
        if (options.auto) {
          const effectiveMode = blockModes[name] || globalAssemblyMode;
          const expectedBody = (effectiveMode === 'link' && gen.linkPath && !gen.hasFallback)
            ? `${heading}\n\n@${gen.linkPath}`
            : `${heading}\n\n${gen.content}`;
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


    fs.writeFileSync(outputPath, fileContent, 'utf-8');
  }

  const genCount = sectionsGenerated.length;
  const totalManaged = MANAGED_SECTIONS.length;
  let message = `Generated ${genCount}/${totalManaged} sections.`;
  if (sectionsFallback.length > 0) message += ` Fallback: ${sectionsFallback.join(', ')}.`;
  if (sectionsSkipped.length > 0) message += ` Skipped (manually edited): ${sectionsSkipped.join(', ')}.`;

  const result = {
    claude_md_path: outputPath,
    action,
    sections_generated: sectionsGenerated,
    sections_fallback: sectionsFallback,
    sections_skipped: sectionsSkipped,
    sections_total: totalManaged,
    message,
  };

  output(result, raw);
}

module.exports = {
  cmdGenerateClaudeMd,
};
