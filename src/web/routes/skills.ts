import { Hono } from "hono";
import { loadSkills, readSkillContent } from "../../skills/loader";

export function createSkillRoutes(): Hono {
  const app = new Hono();

  app.get("/skills", async (c) => {
    const skills = await loadSkills();
    return c.json({
      success: true,
      data: skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
      })),
    });
  });

  app.get("/skills/:id", async (c) => {
    const id = c.req.param("id");
    const skills = await loadSkills();
    const skill = skills.find((s) => s.id === id);
    if (!skill) {
      return c.json({ success: false, error: "Skill not found" }, 404);
    }

    const content = await readSkillContent(id);
    return c.json({
      success: true,
      data: {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        content,
      },
    });
  });

  return app;
}
