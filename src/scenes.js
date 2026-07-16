export const scenes = [
  {
    id: "earth",
    label: "Земля",
    title: "Вы здесь",
    text: "Пока пространство кажется плотно упакованным. Это быстро пройдёт.",
    distanceMeters: 0,
    color: "#d9f1ff",
    radius: 12,
    progress: 0.02
  },
  {
    id: "moon",
    label: "Земля → Луна",
    title: "Первый сосед",
    text: "Между Землёй и Луной поместились бы все остальные планеты Солнечной системы — почти впритык.",
    distanceMeters: 384_400_000,
    color: "#d8d8d4",
    radius: 7,
    progress: 0.23
  },
  {
    id: "sun",
    label: "Земля → Солнце",
    title: "Свет идёт восемь минут",
    text: "Когда вы смотрите на Солнце, вы видите его таким, каким оно было несколько минут назад.",
    distanceMeters: 149_597_870_700,
    color: "#fff2bf",
    radius: 24,
    progress: 0.53
  },
  {
    id: "proxima",
    label: "Солнце → Проксима Центавра",
    title: "Здесь начинается пустота",
    text: "До ближайшей звезды свет летит больше четырёх лет. На этом масштабе Солнечная система была тесным местом.",
    distanceMeters: 40_208_000_000_000_000,
    color: "#ffcab7",
    radius: 9,
    progress: 0.91
  },
  {
    id: "end",
    label: "Дальше",
    title: "Почти всё — между",
    text: "Мы замечаем объекты. Пространство в основном состоит из расстояния между ними.",
    distanceMeters: 40_208_000_000_000_000,
    color: "#ffffff",
    radius: 0,
    progress: 1
  }
];

export const SPEED_OF_LIGHT = 299_792_458;
