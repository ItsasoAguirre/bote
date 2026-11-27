import type { Group, Member } from './types';

/** Colors people can pick for themselves. All keep white initials readable. */
export const MEMBER_COLORS = [
  '#3B5BDB',
  '#1971C2',
  '#0C8599',
  '#2B8A3E',
  '#5C940D',
  '#E67700',
  '#E8590C',
  '#C92A2A',
  '#C2255C',
  '#AE3EC9',
  '#6741D9',
  '#495057',
];

/** The member's chosen color, or a palette color based on their position in the list. */
export function colorAt(members: Member[], index: number): string {
  return members[index]?.color ?? MEMBER_COLORS[Math.max(index, 0) % MEMBER_COLORS.length];
}

/** A color for a new member: the first palette color nobody in the group is using yet. */
export function nextColor(members: Member[]): string {
  const used = new Set(members.map((_, i) => colorAt(members, i).toLowerCase()));
  return MEMBER_COLORS.find((c) => !used.has(c.toLowerCase())) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length];
}

export function memberColor(group: Group, memberId: string): string {
  return colorAt(group.members, group.members.findIndex((m) => m.id === memberId));
}
