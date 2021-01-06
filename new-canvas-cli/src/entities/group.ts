// export interface GroupCategory extends AbstractResource {
//     groups: Group[];
// }
//
// export interface Group extends AbstractResource {
//     id: number;
//     name: string;
//     members_count: number;
//     members: GroupMember[];
// }
//
// export interface GroupMember extends AbstractResource {
//     sortable_name: string;
// }

import { Expose, Type } from "class-transformer";

export class GroupMember {
  @Expose() id = 0;

  @Expose() name = "";

  @Expose({ name: "sortable_name" }) sortableName = "";
}

export class Group {
  @Expose() id = 0;

  @Expose() name = "";

  @Expose({ name: "members_count" }) membersCount = 0;

  @Expose()
  @Type(() => GroupMember)
  members: GroupMember[] = [];
}

export class GroupCategory {
  @Expose() id = 0;

  @Expose() name = "";

  @Expose()
  @Type(() => Group)
  groups: Group[] = [];
}

export interface APIGroupCategory {
  id: number;
  name: string;
  groups: APIGroup[];
}

export interface APIGroup {
  id: number;
  name: string;
  group_category_id: number;
  members_count: number;
  members: APIGroupMember[];
}

export type APIGroupMember = GroupMember;
