import React, { useState, useEffect } from "react";
import { apiFetch } from "../api";
import { LoadingState, EmptyState, PageHeader, SearchBar } from "../components";
import { GraduationCap, BookOpen } from "lucide-react";

interface SkillInfo {
  id: string;
  name: string;
  description: string;
}

interface SkillsResponse {
  success: boolean;
  data: SkillInfo[];
}

export default function Skills() {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<SkillInfo | null>(null);

  useEffect(() => {
    loadSkills();
  }, []);

  async function loadSkills() {
    try {
      const res = await apiFetch<SkillsResponse>("/api/skills");
      setSkills(res.data);
      setError("");
    } catch {
      setError("Failed to load skills");
    } finally {
      setLoading(false);
    }
  }

  const filtered = skills.filter((s) => {
    if (search) {
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
      );
    }
    return true;
  });

  if (loading) return <LoadingState />;

  return (
    <div className="max-w-[1400px]">
      <PageHeader
        title="Skills"
        subtitle="Skills containing patterns and examples for different domains"
        count={skills.length}
      />

      {error && (
        <div className="bg-danger-subtle border border-danger/20 rounded-lg px-4 py-3 text-danger text-sm mb-5">
          {error}
        </div>
      )}

      <div className="mb-6 max-w-md">
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search skills..."
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState description="No skills match your search." />
      ) : (
        <div className="grid grid-cols-3 max-lg:grid-cols-2 max-sm:grid-cols-1 gap-4">
          {filtered.map((skill, i) => (
            <button
              key={skill.id}
              type="button"
              className="group relative bg-bg-1 border rounded-lg overflow-hidden text-left cursor-pointer transition-all duration-200 hover:border-border-hover hover:bg-bg-1/80"
              style={{
                animation: `agCardIn 0.3s ease-out ${i * 20}ms both`,
              }}
              onClick={() => setSelectedSkill(skill)}
            >
              <div className="px-5 py-4">
                <div className="flex items-center gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                    <GraduationCap size={16} className="text-accent" />
                  </div>
                  <span className="font-semibold text-strong truncate">
                    {skill.name}
                  </span>
                </div>
                <p className="text-sm text-muted m-0 leading-relaxed line-clamp-2">
                  {skill.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Skill Detail Modal */}
      {selectedSkill && (
        <div className="fixed inset-0 bg-black/50 z-[400] flex items-center justify-center p-4">
          <div className="bg-bg border border-border rounded-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-4 p-6 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <GraduationCap size={20} className="text-accent" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-strong m-0">
                    {selectedSkill.name}
                  </h3>
                  <p className="text-sm text-muted m-0 mt-0.5">
                    {selectedSkill.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="w-8 h-8 rounded-md border border-border bg-transparent text-muted cursor-pointer flex items-center justify-center hover:bg-bg-2 hover:text-strong transition-colors shrink-0"
                onClick={() => setSelectedSkill(null)}
              >
                &times;
              </button>
            </div>
            <div className="p-6">
              <div className="bg-bg-2 rounded-lg p-4 text-center text-muted">
                <BookOpen size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">Skill details coming soon</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}