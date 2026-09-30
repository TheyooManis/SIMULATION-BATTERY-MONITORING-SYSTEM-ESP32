#include "wokwi-api.h"
#include <stdbool.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>


typedef struct {
  uint8_t pointerReg;
  uint8_t writePhase;

  uint16_t regConfig;
  uint16_t regShunt;
  uint16_t regBus;
  uint16_t regPower;
  uint16_t regCurrent;
  uint16_t regCalibration;

  uint8_t readBuffer[2];
  uint8_t readIndex;

  bool readTransaction;
} ina219_t;

static uint16_t *getRegister(ina219_t *chip, uint8_t reg) {
  switch (reg) {
  case 0x00:
    return &chip->regConfig;
  case 0x01:
    return &chip->regShunt;
  case 0x02:
    return &chip->regBus;
  case 0x03:
    return &chip->regPower;
  case 0x04:
    return &chip->regCurrent;
  case 0x05:
    return &chip->regCalibration;
  default:
    return NULL;
  }
}

static bool on_connect(void *user_data, uint32_t address, bool read) {
  ina219_t *chip = user_data;

  chip->readTransaction = read;
  chip->readIndex = 0;

  if (read) {
    uint16_t *reg = getRegister(chip, chip->pointerReg);

    uint16_t value = 0;
    if (reg)
      value = *reg;

    chip->readBuffer[0] = (value >> 8) & 0xFF;
    chip->readBuffer[1] = value & 0xFF;
  }

  return true;
}

static uint8_t on_read(void *user_data) {
  ina219_t *chip = user_data;

  if (chip->readIndex < 2) {
    return chip->readBuffer[chip->readIndex++];
  }

  return 0xFF;
}

static bool on_write(void *user_data, uint8_t data) {
  ina219_t *chip = user_data;

  if (chip->writePhase == 0) {
    chip->pointerReg = data;
    chip->writePhase = 1;
    return true;
  }

  uint16_t *reg = getRegister(chip, chip->pointerReg);

  if (reg) {
    if (chip->writePhase == 1) {
      *reg = ((uint16_t)data << 8);
      chip->writePhase = 2;
    } else {
      *reg |= data;
      chip->writePhase = 0;
    }
  }

  return true;
}

static void on_disconnect(void *user_data) {
  ina219_t *chip = user_data;
  chip->writePhase = 0;

  // Nilai simulasi
  chip->regBus = 0x1890;     // ~12.5V
  chip->regCurrent = 0x04B0; // ~1200
  chip->regPower = 0x0FA0;   // simulasi daya
}

void chip_init() {
  ina219_t *chip = malloc(sizeof(ina219_t));
  memset(chip, 0, sizeof(ina219_t));

  chip->regConfig = 0x399F;
  chip->regBus = 0x1890;
  chip->regCurrent = 0x04B0;
  chip->regPower = 0x0FA0;
  chip->regCalibration = 0x2000;

  const i2c_config_t config = {.address = 0x40,
                               .scl = pin_init("SCL", INPUT_PULLUP),
                               .sda = pin_init("SDA", INPUT_PULLUP),
                               .connect = on_connect,
                               .read = on_read,
                               .write = on_write,
                               .disconnect = on_disconnect,
                               .user_data = chip};

  i2c_init(&config);
}