export interface TeamMemberOption {
  name: string;
  email: string;
  avatarUrl: string;
}

const TEAM_MEMBERS: TeamMemberOption[] = [
  {
    name: "Aline Ferreira",
    email: "aline.ferreira@bismarchipires.com.br",
    avatarUrl: "https://api.dicebear.com/9.x/adventurer/svg?seed=Aline",
  },
  {
    name: "Bruno Martins",
    email: "bruno.martins@bismarchipires.com.br",
    avatarUrl: "https://api.dicebear.com/9.x/adventurer/svg?seed=Bruno",
  },
  {
    name: "Carla Nunes",
    email: "carla.nunes@bismarchipires.com.br",
    avatarUrl: "https://api.dicebear.com/9.x/adventurer/svg?seed=Carla",
  },
  {
    name: "Diego Rocha",
    email: "diego.rocha@bismarchipires.com.br",
    avatarUrl: "https://api.dicebear.com/9.x/adventurer/svg?seed=Diego",
  },
  {
    name: "Fernanda Lima",
    email: "fernanda.lima@bismarchipires.com.br",
    avatarUrl: "https://api.dicebear.com/9.x/adventurer/svg?seed=Fernanda",
  },
];

export function getSolicitanteOptions() {
  return TEAM_MEMBERS;
}
