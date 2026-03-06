import fs from "node:fs/promises";
import path from "node:path";

const SKILLS_DIR = path.resolve(import.meta.dir, "..", "..", "skills");

export type Skill = {
  id: string;
  name: string;
  description: string;
  path: string;
};

function parseFrontmatter(content: string): {
  meta: Record<string, string>;
  body: string;
} {
  if (!content.startsWith("---")) return { meta: {}, body: content };
  const end = content.indexOf("\n---", 3);
  if (end === -1) return { meta: {}, body: content };

  const meta: Record<string, string> = {};
  for (const line of content.slice(3, end).trim().split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  return { meta, body: content.slice(end + 4).trim() };
}

export async function loadSkills(): Promise<Skill[]> {
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills: Skill[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(SKILLS_DIR, entry.name, "SKILL.md");
      try {
        const content = await fs.readFile(skillPath, "utf8");
        const { meta } = parseFrontmatter(content);
        skills.push({
          id: entry.name,
          name: meta.name ?? entry.name,
          description: meta.description ?? "",
          path: skillPath,
        });
      } catch {
        // skip invalid
      }
    }
    return skills;
  } catch {
    return [];
  }
}

export async function readSkillContent(id: string): Promise<string | null> {
  const skillPath = path.join(SKILLS_DIR, id, "SKILL.md");
  try {
    return await fs.readFile(skillPath, "utf8");
  } catch {
    return null;
  }
}
