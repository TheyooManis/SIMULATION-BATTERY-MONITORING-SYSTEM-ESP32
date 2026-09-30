#ifndef JSON_HELPER_H
#define JSON_HELPER_H

#include <ArduinoJson.h>

class JsonVar {
private:
  StaticJsonDocument<256> doc;

public:
  void insert(const char *key, float value) { doc[key] = value; }

  void insert(const char *key, const char *value) { doc[key] = value; }

  void insert(const char *key, String value) { doc[key] = value; }

  String toString() {
    String out;
    serializeJson(doc, out);
    return out;
  }

  void clear() { doc.clear(); }
};

#endif