<template>
  <NDrawer :show="show" :width="520" placement="right" @update:show="close">
    <NDrawerContent :title="t('discovery.title')" closable :native-scrollbar="false">
      <NAlert v-if="error" type="warning" :show-icon="true" style="margin-bottom: 12px">
        {{ error }}
      </NAlert>

      <template v-if="stage === 'asking'">
        <NText depth="3" style="display: block; margin-bottom: 8px">
          {{ t('discovery.round', { n: round }) }} · {{ t('discovery.asking') }}
        </NText>

        <NAlert v-if="assumptions.length" type="info" :show-icon="false" style="margin-bottom: 12px">
          <template #header>{{ t('discovery.assumptions') }}</template>
          <div v-for="(item, index) in assumptions" :key="index">- {{ item }}</div>
        </NAlert>

        <NCard v-for="question in questions" :key="question.id" size="small" style="margin-bottom: 8px">
          <NText>{{ question.text }}</NText>
          <div v-if="question.why">
            <NText depth="3" style="font-size: 12px">{{ t('discovery.why') }}: {{ question.why }}</NText>
          </div>
        </NCard>

        <NInput
          v-model:value="answer"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :placeholder="t('discovery.answerPlaceholder')"
          :disabled="loading"
        />
        <NButton
          type="primary"
          block
          style="margin-top: 10px"
          :loading="loading"
          :disabled="!answer.trim()"
          @click="submitAnswer"
        >
          {{ t('discovery.submit') }}
        </NButton>
      </template>

      <template v-else>
        <NText depth="3" style="display: block; margin-bottom: 12px">
          {{ t('discovery.specTitle') }} · {{ t('discovery.specHint') }}
        </NText>

        <NCard v-for="(item, index) in items" :key="item.id" size="small" style="margin-bottom: 8px">
          <NFlex align="center" :size="8" style="margin-bottom: 6px">
            <NCheckbox v-model:checked="item.confirmed" />
            <NTag size="small" :bordered="false">{{ item.dimension }}</NTag>
            <NTag size="small" :bordered="false" type="warning">{{ sourceLabel(item.source) }}</NTag>
          </NFlex>
          <NInput
            v-model:value="item.value"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 4 }"
          />
        </NCard>

        <NText v-if="!items.length" depth="3">{{ t('discovery.emptySpec') }}</NText>

        <NButton
          type="primary"
          block
          style="margin-top: 12px"
          :loading="loading"
          :disabled="!allConfirmed"
          @click="generate"
        >
          {{ t('discovery.generate') }}
        </NButton>
        <NText v-if="items.length && !allConfirmed" depth="3" style="font-size: 12px">
          {{ t('discovery.notAllConfirmed') }}
        </NText>
      </template>

      <template #footer>
        <NSpace justify="space-between">
          <NButton quaternary @click="skip">{{ t('discovery.skip') }}</NButton>
          <NButton quaternary @click="close">{{ t('discovery.close') }}</NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NDrawer, NDrawerContent, NButton, NInput, NCheckbox, NTag,
  NAlert, NCard, NSpace, NText, NFlex,
} from 'naive-ui'
import type {
  IDiscoveryService, ClarifyingQuestion, DiscoverySession, SpecItem,
} from '@prompt-optimizer/core'

const props = defineProps<{
  show: boolean
  service: IDiscoveryService
  modelKey: string
  initialInput: string
}>()

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
  (e: 'apply', specText: string): void
  (e: 'skip'): void
}>()

const { t } = useI18n()

const stage = ref<'asking' | 'review'>('asking')
const sessionId = ref('')
const questions = ref<ClarifyingQuestion[]>([])
const assumptions = ref<string[]>([])
const items = ref<SpecItem[]>([])
const answer = ref('')
const round = ref(1)
const loading = ref(false)
const error = ref('')

const allConfirmed = computed(
  () => items.value.length > 0 && items.value.every((item) => item.confirmed),
)

function message(errorValue: unknown): string {
  return errorValue instanceof Error ? errorValue.message : t('discovery.error')
}

function sourceLabel(source: string): string {
  if (source === 'said') return t('discovery.sourceSaid')
  if (source === 'confirmed') return t('discovery.sourceConfirmed')
  return t('discovery.sourcePending')
}

function applySession(session: DiscoverySession): void {
  round.value = Math.max(1, session.rounds)
  questions.value = session.pendingQuestions
  assumptions.value = session.assumptions
}

function reset(): void {
  stage.value = 'asking'
  sessionId.value = ''
  questions.value = []
  assumptions.value = []
  items.value = []
  answer.value = ''
  round.value = 1
  error.value = ''
}

async function buildSpec(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const spec = await props.service.buildSpec(sessionId.value, props.modelKey)
    items.value = spec.map((item) => ({ ...item }))
    stage.value = 'review'
  } catch (errorValue) {
    error.value = message(errorValue)
  } finally {
    loading.value = false
  }
}

async function open(): Promise<void> {
  reset()
  loading.value = true
  try {
    const session = await props.service.start(props.initialInput, props.modelKey)
    sessionId.value = session.id
    applySession(session)
    if (questions.value.length === 0) await buildSpec()
  } catch (errorValue) {
    error.value = message(errorValue)
  } finally {
    loading.value = false
  }
}

async function submitAnswer(): Promise<void> {
  if (!answer.value.trim() || !sessionId.value) return
  loading.value = true
  error.value = ''
  try {
    const reply = await props.service.answer(sessionId.value, answer.value, props.modelKey)
    answer.value = ''
    const session = props.service.getSession(sessionId.value)
    if (session) round.value = Math.max(1, session.rounds)
    if (reply.stage === 'done') {
      await buildSpec()
    } else {
      questions.value = reply.questions
      assumptions.value = reply.assumptions
      stage.value = 'asking'
    }
  } catch (errorValue) {
    error.value = message(errorValue)
  } finally {
    loading.value = false
  }
}

async function generate(): Promise<void> {
  if (!allConfirmed.value) {
    error.value = t('discovery.notAllConfirmed')
    return
  }
  loading.value = true
  error.value = ''
  try {
    await props.service.updateSpec(sessionId.value, items.value)
    const specText = await props.service.toTargetPrompt(sessionId.value)
    emit('apply', specText)
    close()
  } catch (errorValue) {
    error.value = message(errorValue)
  } finally {
    loading.value = false
  }
}

async function skip(): Promise<void> {
  if (sessionId.value) await props.service.skip(sessionId.value)
  emit('skip')
  close()
}

function close(): void {
  emit('update:show', false)
}

watch(
  () => props.show,
  (visible) => {
    if (visible) void open()
  },
)
</script>
