import { test, expect } from "bun:test";
import React from "react";
import { renderHTML, mount, click } from "../test-helpers";
import { SearchBar } from "./SearchBar";

test("SearchBar renders input element", () => {
  const html = renderHTML(React.createElement(SearchBar, { value: "", onChange: () => {} }));
  expect(html).toContain("<input");
  expect(html).toContain('type="text"');
});

test("SearchBar uses default placeholder", () => {
  const html = renderHTML(React.createElement(SearchBar, { value: "", onChange: () => {} }));
  expect(html).toContain('placeholder="Search..."');
});

test("SearchBar uses custom placeholder", () => {
  const html = renderHTML(React.createElement(SearchBar, { value: "", onChange: () => {}, placeholder: "Find..." }));
  expect(html).toContain('placeholder="Find..."');
});

test("SearchBar shows clear button when value is non-empty", () => {
  const html = renderHTML(React.createElement(SearchBar, { value: "test", onChange: () => {} }));
  expect(html).toContain('aria-label="Clear search"');
});

test("SearchBar hides clear button when value is empty", () => {
  const html = renderHTML(React.createElement(SearchBar, { value: "", onChange: () => {} }));
  expect(html).not.toContain('aria-label="Clear search"');
});

test("SearchBar clear button calls onChange with empty string", () => {
  let val = "test";
  const { container, unmount } = mount(
    React.createElement(SearchBar, { value: "test", onChange: (v: string) => { val = v; } }),
  );
  const clearBtn = container.querySelector("[aria-label='Clear search']")!;
  click(clearBtn);
  expect(val).toBe("");
  unmount();
});
