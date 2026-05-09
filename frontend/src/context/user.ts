import { createContextId } from "@builder.io/qwik";

export interface UserProfile {
  name: string;
  surname: string;
  email: string;
  grade: string;
  curriculum: string;
  subjects: string[];
  profilePicture?: string;
}

export interface UserState {
  profile: UserProfile | null;
  loading: boolean;
}

export const UserContext = createContextId<UserState>("user-context");
