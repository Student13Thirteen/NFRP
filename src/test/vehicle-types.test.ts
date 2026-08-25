import { describe, expect, it } from 'vitest';
import { MotorVehicleType, TankCargoType, TrailerBodyType } from '@prisma/client';
import {
  UNCLASSIFIED_FILTER_VALUE,
  getMotorVehicleHeading,
  getMotorVehicleTypeLabel,
  getTrailerHeading,
  getTrailerTypeLabel,
  matchesMotorVehicleTypeFilter,
  matchesTrailerTypeFilter,
  parseMotorVehicleType,
  parseMotorVehicleTypeFilter,
  parseTankCargo,
  parseTrailerBodyType
} from '@/lib/vehicle-types';

describe('etichette tipologie flotta', () => {
  it('usa i termini di officina per i mezzi a motore', () => {
    expect(getMotorVehicleTypeLabel(MotorVehicleType.TRACTOR_UNIT)).toBe('Trattore');
    expect(getMotorVehicleTypeLabel(MotorVehicleType.RIGID_TRUCK)).toBe('Motrice');
    expect(getMotorVehicleTypeLabel(MotorVehicleType.VAN)).toBe('Furgone');
    expect(getMotorVehicleTypeLabel(MotorVehicleType.TRUCK)).toBe('Autocarro');
    expect(getMotorVehicleTypeLabel(MotorVehicleType.CAR)).toBe('Autovettura');
  });

  it('non inventa una tipologia per i mezzi non ancora classificati', () => {
    expect(getMotorVehicleTypeLabel(null)).toBe('Da classificare');
    expect(getMotorVehicleHeading({ plate: 'ZZ223ZZ', vehicleType: null })).toBe('Mezzo ZZ223ZZ');
    expect(getMotorVehicleHeading({ plate: 'ZZ177ZZ', vehicleType: MotorVehicleType.CAR })).toBe('Autovettura ZZ177ZZ');
  });

  it('distingue la cisterna carburante da quella GPL', () => {
    expect(getTrailerTypeLabel({ bodyType: TrailerBodyType.TANK, tankCargo: TankCargoType.FUEL })).toBe(
      'Cisterna Benzina / Gasolio'
    );
    expect(getTrailerTypeLabel({ bodyType: TrailerBodyType.TANK, tankCargo: TankCargoType.LPG })).toBe('Cisterna GPL');
    expect(getTrailerTypeLabel({ bodyType: TrailerBodyType.CONTAINER, tankCargo: null })).toBe('Container');
    expect(getTrailerTypeLabel({ bodyType: TrailerBodyType.REEFER, tankCargo: null })).toBe('Frigo');
  });

  it('dichiara la cisterna senza carico invece di sceglierne uno', () => {
    expect(getTrailerTypeLabel({ bodyType: TrailerBodyType.TANK, tankCargo: null })).toBe(
      'Cisterna (carico da precisare)'
    );
    expect(getTrailerHeading({ plate: 'ZZ640ZZ', bodyType: null, tankCargo: null })).toBe('Semirimorchio ZZ640ZZ');
  });
});

describe('parsing tipologie', () => {
  it('accetta il valore vuoto come "da classificare"', () => {
    expect(parseMotorVehicleType('')).toBeNull();
    expect(parseMotorVehicleType(null)).toBeNull();
    expect(parseTrailerBodyType(undefined)).toBeNull();
  });

  it('rifiuta valori non previsti invece di salvarli', () => {
    expect(() => parseMotorVehicleType('BICICLETTA')).toThrow('Tipologia mezzo non valida.');
    expect(() => parseTrailerBodyType('PORTAUOVA')).toThrow('Tipologia semirimorchio non valida.');
  });

  it('azzera il carico quando il semirimorchio non e una cisterna', () => {
    expect(parseTankCargo('LPG', TrailerBodyType.TANK)).toBe(TankCargoType.LPG);
    expect(parseTankCargo('LPG', TrailerBodyType.CONTAINER)).toBeNull();
    expect(parseTankCargo('LPG', null)).toBeNull();
  });
});

describe('filtri per tipologia', () => {
  it('senza filtro mostra tutto', () => {
    expect(matchesMotorVehicleTypeFilter({ vehicleType: MotorVehicleType.CAR }, null)).toBe(true);
    expect(matchesTrailerTypeFilter({ bodyType: null, tankCargo: null }, null)).toBe(true);
  });

  it('isola i mezzi ancora da classificare', () => {
    const filter = parseMotorVehicleTypeFilter(UNCLASSIFIED_FILTER_VALUE);
    expect(matchesMotorVehicleTypeFilter({ vehicleType: null }, filter)).toBe(true);
    expect(matchesMotorVehicleTypeFilter({ vehicleType: MotorVehicleType.TRACTOR_UNIT }, filter)).toBe(false);
  });

  it('ignora un filtro tipologia inesistente invece di svuotare la lista', () => {
    expect(parseMotorVehicleTypeFilter('QUALSIASI')).toBeNull();
  });

  it('filtra le cisterne per carico solo dentro le cisterne', () => {
    const tankFuel = { bodyType: TrailerBodyType.TANK, tankCargo: TankCargoType.FUEL };
    const tankLpg = { bodyType: TrailerBodyType.TANK, tankCargo: TankCargoType.LPG };
    expect(matchesTrailerTypeFilter(tankFuel, TrailerBodyType.TANK, TankCargoType.FUEL)).toBe(true);
    expect(matchesTrailerTypeFilter(tankLpg, TrailerBodyType.TANK, TankCargoType.FUEL)).toBe(false);
    expect(matchesTrailerTypeFilter(tankLpg, TrailerBodyType.TANK, null)).toBe(true);
  });
});
