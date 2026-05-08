import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  createSecureDiagnostics,
  createSecureStorage,
} from 'secure-storage-api';

import { backendCatalog, getBackendDefinition, type BackendId } from './src/backends';
import {
  demoPropertyCatalog,
  demoPropertyList,
  getDemoPropertyById,
  getDemoRegistry,
  type DemoPropertyId,
} from './src/demo-properties';
import { parseInputValue, stringifyValue } from './src/value-utils';

function createPrettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

type StorageSession = {
  backend: ReturnType<(typeof backendCatalog)[number]['createBackend']>;
  backendId: BackendId;
  backendLabel: string;
  diagnostics: ReturnType<typeof createSecureDiagnostics>;
  storage: Awaited<ReturnType<typeof createSecureStorage>>;
};

export default function App() {
  const [selectedBackendId, setSelectedBackendId] = useState<BackendId | null>(null);
  const [session, setSession] = useState<StorageSession | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [authState, setAuthState] = useState({
    hasBoundUser: true,
    hasActiveSession: true,
  });
  const authStateRef = useRef(authState);
  const [selectedPropertyId, setSelectedPropertyId] = useState<DemoPropertyId>('configuredToken');
  const [inputValue, setInputValue] = useState('configured-token-001');
  const [lastStatus, setLastStatus] = useState('idle');
  const [lastResult, setLastResult] = useState('No operation yet.');
  const [dumpJson, setDumpJson] = useState('');

  useEffect(() => {
    authStateRef.current = authState;
  }, [authState]);

  useEffect(() => {
    const entry = getDemoPropertyById(selectedPropertyId);
    setInputValue(entry.exampleValueText);
  }, [selectedPropertyId]);

  const selectedProperty = useMemo(() => getDemoPropertyById(selectedPropertyId), [selectedPropertyId]);
  const selectedPropertyMetadata = [
    `Namespace: ${selectedProperty.property.namespace}`,
    `Name: ${selectedProperty.property.name}`,
    `Scope: ${selectedProperty.property.scope}`,
    `Access: ${selectedProperty.property.access}`,
    `Codec: ${String(selectedProperty.property.codec)}`,
  ].join('\n');
  const selectedPropertyOptionsText = selectedProperty.property.options
    ? createPrettyJson(selectedProperty.property.options)
    : 'No property-specific adapter options configured for this property.';

  async function selectBackend(backendId: BackendId) {
    setLoadingMessage('Creating secure storage instance...');
    setLastStatus('backend:creating');
    setLastResult('Preparing the generic secure-storage API on top of the selected native backend.');
    setDumpJson('');

    try {
      const definition = getBackendDefinition(backendId);
      const backend = definition.createBackend();
      const storage = await createSecureStorage({
        backend,
        authStateProvider: {
          async getAuthState() {
            return authStateRef.current;
          },
        },
        registry: getDemoRegistry(),
      });

      setSession({
        backend,
        backendId,
        backendLabel: definition.label,
        diagnostics: createSecureDiagnostics({ storage }),
        storage,
      });
      setSelectedBackendId(backendId);
      setLastStatus('backend:selected');
      setLastResult(`Selected backend: ${definition.label}`);
    } catch (error) {
      setLastStatus('backend:error');
      setLastResult(`Failed to create backend: ${formatError(error)}`);
    } finally {
      setLoadingMessage('');
    }
  }

  async function runOperation(operation: 'set' | 'get' | 'remove' | 'has' | 'clearUserStorage' | 'seed' | 'probeUserPresence') {
    if (!session) {
      return;
    }

    const property = selectedProperty.property;

    try {
      if (operation === 'set') {
        const parsedValue = parseInputValue(property, inputValue);
        await session.storage.set(property as never, parsedValue as never);
        setLastStatus('set:ok');
        setLastResult(`Saved ${selectedProperty.label} successfully.`);
        return;
      }

      if (operation === 'get') {
        const value = await session.storage.get(property as never);
        setLastStatus('get:ok');
        setLastResult(`Read ${selectedProperty.label}: ${stringifyValue(value)}`);
        return;
      }

      if (operation === 'remove') {
        await session.storage.remove(property as never);
        setLastStatus('remove:ok');
        setLastResult(`Removed ${selectedProperty.label}.`);
        return;
      }

      if (operation === 'has') {
        const exists = await session.storage.has(property as never);
        setLastStatus('has:ok');
        setLastResult(`Has ${selectedProperty.label}: ${exists}`);
        return;
      }

      if (operation === 'clearUserStorage') {
        await session.storage.clearUserStorage();
        setLastStatus('clearUserStorage:ok');
        setLastResult('Cleared every user-scoped property.');
        return;
      }

      if (operation === 'seed') {
        await seedDemoValues(session.storage);
        setLastStatus('seed:ok');
        setLastResult('Seeded demo values across the generic API.');
        return;
      }

      if (operation === 'probeUserPresence') {
        const probeKey = 'secure-storage-example:probe:userPresence';

        try {
          await session.backend.setItem(probeKey, 'probe', {
            requiresUserPresence: true,
          });
          const value = await session.backend.getItem(probeKey, {
            requiresUserPresence: true,
          });
          setLastStatus('probeUserPresence:ok');
          setLastResult(`User presence probe result: ${value}`);
        } finally {
          try {
            await session.backend.removeItem(probeKey);
          } catch {
            // Ignore probe cleanup failures so the result reflects the protected operations.
          }
        }

        return;
      }
    } catch (error) {
      setLastStatus(`${operation}:error`);
      setLastResult(`${operation} failed: ${formatError(error)}`);
    }
  }

  async function dumpEvidence() {
    if (!session) {
      return;
    }

    try {
      const diagnostics = await Promise.all(demoPropertyCatalog.map(async (entry) => {
        try {
          const rows = await session.diagnostics.inspectProperties([entry.property]);
          return {
            id: entry.id,
            status: 'ok',
            diagnostic: rows[0] ?? null,
          };
        } catch (error) {
          return {
            id: entry.id,
            status: 'error',
            error: formatError(error),
          };
        }
      }));

      const decodedEntries = await Promise.all(demoPropertyCatalog.map(async (entry) => {
        if (entry.property.access === 'userPresence') {
          return {
            id: entry.id,
            label: entry.label,
            status: 'skipped',
            reason: 'Skipped in dump evidence because this property requires user presence.',
          };
        }

        try {
          const value = await session.storage.get(entry.property as never);
          return {
            id: entry.id,
            label: entry.label,
            status: 'ok',
            value,
          };
        } catch (error) {
          return {
            id: entry.id,
            label: entry.label,
            status: 'error',
            error: formatError(error),
          };
        }
      }));

      let rawEntries;
      try {
        const rawKeys = await session.backend.getAllKeys();
        rawEntries = await Promise.all(rawKeys.map(async (key) => {
          try {
            return {
              key,
              status: 'ok',
              rawValue: await session.backend.getItem(key),
            };
          } catch (error) {
            return {
              key,
              status: 'error',
              error: formatError(error),
            };
          }
        }));
      } catch (error) {
        rawEntries = [{
          status: 'error',
          error: formatError(error),
        }];
      }

      const payload = {
        backendId: session.backendId,
        backendLabel: session.backendLabel,
        authState,
        selectedProperty: {
          id: selectedProperty.id,
          label: selectedProperty.label,
          metadata: {
            namespace: selectedProperty.property.namespace,
            name: selectedProperty.property.name,
            scope: selectedProperty.property.scope,
            access: selectedProperty.property.access,
            codec: String(selectedProperty.property.codec),
          },
          options: selectedProperty.property.options ?? null,
        },
        diagnostics,
        decodedEntries,
        rawEntries,
      };

      setDumpJson(createPrettyJson(payload));
      setLastStatus('dump:ok');
      setLastResult('Generated technical evidence for the currently selected backend and property.');
    } catch (error) {
      setLastStatus('dump:error');
      setLastResult(`dump failed: ${formatError(error)}`);
    }
  }

  if (!selectedBackendId || !session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Secure Storage Example</Text>
          <Text style={styles.subtitle} testID="backend-selection-intro">
            A friendly lab for comparing mobile secure-storage backends through the same generic API.
          </Text>

          <InfoCard
            eyebrow="How to use this screen"
            title="Pick the backend you want to inspect"
            body="After selecting a backend, the app opens one shared testing screen. From there you can try CRUD operations, flip auth-state toggles, compare user-presence behavior, and generate copyable technical evidence."
          />

          {backendCatalog.map((backend) => (
            <Pressable
              key={backend.id}
              accessibilityLabel={`Select ${backend.label}`}
              onPress={() => void selectBackend(backend.id)}
              style={styles.backendButton}
              testID={`select-backend-${backend.id}`}
            >
              <Text style={styles.backendTitle}>{backend.label}</Text>
              <Text style={styles.backendDescription}>{backend.description}</Text>
            </Pressable>
          ))}

          <Text style={styles.caption}>{loadingMessage || 'Android custom dev client required for the full native matrix.'}</Text>
          <SelectableBlock label="Selection result" testID="selection-result">{lastResult}</SelectableBlock>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Secure Storage Example</Text>
        <Text style={styles.subtitle} testID="selected-backend-label">Backend: {session.backendLabel}</Text>

        <InfoCard
          eyebrow="What this screen is testing"
          title={selectedProperty.label}
          body={selectedProperty.testFocus}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current status</Text>
          <StatusPill label={lastStatus} testID="operation-status" />
          <SelectableBlock label="Latest result" testID="operation-result">{lastResult}</SelectableBlock>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security context</Text>
          <Text style={styles.caption}>
            These toggles simulate the auth state that the core API uses to allow or reject reads and writes.
          </Text>
          <ToggleRow
            label="Bound user"
            testID="toggle-bound-user"
            value={authState.hasBoundUser}
            onValueChange={(value) => setAuthState((current) => ({ ...current, hasBoundUser: value }))}
          />
          <ToggleRow
            label="Active session"
            testID="toggle-active-session"
            value={authState.hasActiveSession}
            onValueChange={(value) => setAuthState((current) => ({ ...current, hasActiveSession: value }))}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose a property scenario</Text>
          <Text style={styles.caption}>
            Each property demonstrates a slightly different contract: scope, access rules, codec shape, defaults, or adapter-specific options.
          </Text>
          {demoPropertyCatalog.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityLabel={`Choose property ${entry.label}`}
              onPress={() => setSelectedPropertyId(entry.id)}
              style={[styles.choiceButton, entry.id === selectedPropertyId && styles.choiceButtonSelected]}
              testID={`property-${entry.id}`}
            >
              <Text style={styles.choiceTitle}>{entry.label}</Text>
              <Text style={styles.choiceDescription}>{entry.description}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Selected property details</Text>
          <SelectableBlock label="Property metadata" testID="selected-property-metadata">
            {selectedPropertyMetadata}
          </SelectableBlock>
          <SelectableBlock label="Property adapter options" testID="selected-property-options">
            {selectedPropertyOptionsText}
          </SelectableBlock>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Value to use</Text>
          <Text style={styles.caption}>
            This input is editable and copyable. The app parses it according to the selected property codec before calling the generic API.
          </Text>
          <TextInput
            accessibilityLabel="Value input"
            autoCapitalize="none"
            multiline
            onChangeText={setInputValue}
            style={styles.input}
            testID="value-input"
            value={inputValue}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Try operations</Text>
          <Text style={styles.caption}>
            Start with Set and Get for the selected property. Use Dump evidence when you want copyable technical output for debugging or comparison.
          </Text>
          <View style={styles.rowWrap}>
            <ActionButton label="Set value" onPress={() => void runOperation('set')} testID="action-set" />
            <ActionButton label="Get value" onPress={() => void runOperation('get')} testID="action-get" />
            <ActionButton label="Remove" onPress={() => void runOperation('remove')} testID="action-remove" />
            <ActionButton label="Has value" onPress={() => void runOperation('has')} testID="action-has" />
          </View>
          <View style={styles.rowWrap}>
            <ActionButton label="Seed demo data" onPress={() => void runOperation('seed')} testID="action-seed" />
            <ActionButton label="Clear user storage" onPress={() => void runOperation('clearUserStorage')} testID="action-clear-user" />
            <ActionButton label="Probe user presence" onPress={() => void runOperation('probeUserPresence')} testID="action-probe-user-presence" />
            <ActionButton label="Dump evidence" onPress={() => void dumpEvidence()} testID="action-dump-json" />
          </View>
          <Text style={styles.caption}>
            Probe user presence performs a protected write and then a protected read. Native providers may prompt on write, read, both, or neither visible step. Prompt behavior can differ by backend, and emulators may skip biometric UI entirely.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Technical evidence</Text>
          <Text style={styles.caption}>
            This block is selectable and copyable. It includes the selected property metadata, its configured adapter options, diagnostics, decoded values, and raw backend entries.
          </Text>
          <StatusPill label={lastStatus} testID="technical-evidence-status" />
          <SelectableBlock label="Debug JSON" testID="debug-dump">{dumpJson || 'No dump generated yet.'}</SelectableBlock>
        </View>

        <Pressable
          accessibilityLabel="Back to backend selection"
          onPress={() => {
            setSelectedBackendId(null);
            setSession(null);
            setDumpJson('');
            setLastStatus('backend:reset');
            setLastResult('Returned to backend selection.');
          }}
          style={styles.backButton}
          testID="back-to-selection"
        >
          <Text style={styles.backButtonText}>Back to backend selection</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleRow(props: {
  label: string;
  onValueChange: (value: boolean) => void;
  testID: string;
  value: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.choiceTitle}>{props.label}</Text>
      <Switch onValueChange={props.onValueChange} testID={props.testID} value={props.value} />
    </View>
  );
}

function ActionButton(props: { label: string; onPress: () => void; testID: string }) {
  return (
    <Pressable accessibilityLabel={props.label} onPress={props.onPress} style={styles.actionButton} testID={props.testID}>
      <Text style={styles.actionButtonText}>{props.label}</Text>
    </Pressable>
  );
}

function InfoCard(props: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.infoCard}>
      <Text style={styles.infoCardEyebrow}>{props.eyebrow}</Text>
      <Text style={styles.infoCardTitle}>{props.title}</Text>
      <Text style={styles.infoCardBody}>{props.body}</Text>
    </View>
  );
}

function SelectableBlock(props: { children: string; label: string; testID: string }) {
  return (
    <View style={styles.selectableBlock}>
      <Text style={styles.selectableLabel}>{props.label}</Text>
      <Text selectable style={styles.selectableValue} testID={props.testID}>
        {props.children}
      </Text>
    </View>
  );
}

function StatusPill(props: { label: string; testID: string }) {
  return (
    <View style={styles.statusPill}>
      <Text selectable style={styles.statusPillText} testID={props.testID}>
        {props.label}
      </Text>
    </View>
  );
}

async function seedDemoValues(storage: Awaited<ReturnType<typeof createSecureStorage>>) {
  await storage.set(getDemoPropertyById('appInstallId').property, 'install-android-001');
  await storage.set(getDemoPropertyById('refreshToken').property, 'token-123');
  await storage.set(getDemoPropertyById('configuredToken').property, 'configured-token-001');
  await storage.set(getDemoPropertyById('sessionCounter').property, 41);
  await storage.set(getDemoPropertyById('acceptedTerms').property, true);
  await storage.set(getDemoPropertyById('preferences').property, {
    theme: 'dark',
    marketingOptIn: true,
  });
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    const messages = [error.message];
    let currentCause = 'cause' in error ? error.cause : undefined;

    while (currentCause instanceof Error) {
      messages.push(currentCause.message);
      currentCause = 'cause' in currentCause ? currentCause.cause : undefined;
    }

    if (currentCause !== undefined && !(currentCause instanceof Error)) {
      messages.push(String(currentCause));
    }

    return messages.join(' <- ');
  }

  return String(error);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#eef4ff',
  },
  content: {
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#101828',
  },
  subtitle: {
    fontSize: 16,
    color: '#475467',
  },
  infoCard: {
    padding: 18,
    borderRadius: 18,
    backgroundColor: '#175cd3',
    gap: 6,
  },
  infoCardEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#d1e0ff',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  infoCardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
  },
  infoCardBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#eaf2ff',
  },
  section: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    gap: 12,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    shadowColor: '#101828',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  backendButton: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d0d5dd',
    gap: 6,
  },
  backendTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101828',
  },
  backendDescription: {
    fontSize: 14,
    color: '#475467',
  },
  choiceButton: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    gap: 4,
    backgroundColor: '#fcfcfd',
  },
  choiceButtonSelected: {
    borderColor: '#175cd3',
    backgroundColor: '#eff4ff',
  },
  choiceTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101828',
  },
  choiceDescription: {
    fontSize: 13,
    color: '#475467',
    lineHeight: 18,
  },
  input: {
    minHeight: 84,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#98a2b3',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#101828',
    textAlignVertical: 'top',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#175cd3',
  },
  actionButtonText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  caption: {
    fontSize: 13,
    color: '#475467',
    lineHeight: 18,
  },
  selectableBlock: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#d0d5dd',
    backgroundColor: '#f8fafc',
    gap: 8,
  },
  selectableLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#344054',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  selectableValue: {
    fontSize: 14,
    color: '#101828',
    lineHeight: 20,
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#eff4ff',
    borderWidth: 1,
    borderColor: '#b2ddff',
  },
  statusPillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#175cd3',
  },
  backButton: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#101828',
    marginBottom: 20,
  },
  backButtonText: {
    color: '#ffffff',
    textAlign: 'center',
    fontWeight: '700',
  },
});
