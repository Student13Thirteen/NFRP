import { EntityType, type Driver, type OtherEntity, type Tractor, type Trailer } from '@prisma/client';

export type EntityOption = {
  key: string;
  type: EntityType;
  id: string;
  label: string;
  group: string;
  active: boolean;
};

export function buildEntityKey(type: EntityType, id: string): string {
  return `${type}:${id}`;
}

export function buildEntityOptions(input: {
  drivers: Driver[];
  tractors: Tractor[];
  trailers: Trailer[];
  otherEntities: OtherEntity[];
}): EntityOption[] {
  return [
    ...input.drivers.map((driver) => ({
      key: buildEntityKey(EntityType.DRIVER, driver.id),
      type: EntityType.DRIVER,
      id: driver.id,
      label: `${driver.lastName} ${driver.firstName}`,
      group: 'Autisti',
      active: driver.active
    })),
    ...input.tractors.map((tractor) => ({
      key: buildEntityKey(EntityType.TRACTOR, tractor.id),
      type: EntityType.TRACTOR,
      id: tractor.id,
      label: tractor.plate,
      group: 'Trattori',
      active: tractor.active
    })),
    ...input.trailers.map((trailer) => ({
      key: buildEntityKey(EntityType.TRAILER, trailer.id),
      type: EntityType.TRAILER,
      id: trailer.id,
      label: trailer.plate,
      group: 'Semirimorchi',
      active: trailer.active
    })),
    ...input.otherEntities.map((entity) => ({
      key: buildEntityKey(EntityType.OTHER, entity.id),
      type: EntityType.OTHER,
      id: entity.id,
      label: `${entity.category}: ${entity.name}`,
      group: 'Altro',
      active: entity.active
    }))
  ];
}
