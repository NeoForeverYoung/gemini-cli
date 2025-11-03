# Gemini Agent Definition Specification

**Version:** 0.1.0
**Status:** Draft

## 1. Introduction & Motivation

This document specifies the structure of a **Gemini Agent Definition**. The primary motivation for this specification is to formalize a declarative, portable, and runtime-agnostic standard for defining agentic capabilities within the Gemini ecosystem.

Currently, the Gemini CLI's subagent implementation (`AgentDefinition`) serves as a *de facto* specification. It provides a structured configuration that is inflated into a live agentic loop by a runtime (`AgentExecutor`). By formalizing this pattern, we aim to:

*   **Promote Interoperability:** Create a common target for different agent runtimes (e.g., Gemini CLI, Agent Development Kits (ADK), future APIs) to prevent specification fragmentation.
*   **Enable Portability:** Allow agent definitions to be easily shared, versioned, and deployed across various systems without modification.
*   **Simplify Agent Creation:** Provide a clear, declarative contract for developers to define an agent's persona, capabilities, and constraints without needing to implement the underlying ReAct loop logic.

## 2. Core Concept

A Gemini Agent is defined by a single, declarative configuration object. This object encapsulates everything needed for a runtime to execute the agent, including its identity, persona, toolset, and I/O schema.

The core principle is the **separation of definition from execution**. The `AgentDefinition` is a static blueprint, while a runtime environment (like the `AgentExecutor` in Gemini CLI) is responsible for "inflating" this blueprint into a live, stateful process that can execute a ReAct loop.

## 3. Specification Schema

An `AgentDefinition` is a JSON or TypeScript object with the following top-level properties.

---

### **`name`**
*   **Type:** `string`
*   **Required:** Yes
*   **Description:** A unique, machine-readable identifier for the agent (e.g., `codebase_investigator`). This is used to register and call the agent as a tool.

### **`displayName`**
*   **Type:** `string`
*   **Required:** No
*   **Description:** A human-readable name for the agent, used for display purposes in UIs.

### **`description`**
*   **Type:** `string`
*   **Required:** Yes
*   **Description:** A detailed explanation of the agent's purpose, capabilities, and when it should be used. This description is critical for the parent agent (or LLM) to decide when to delegate a task to this agent.

### **`inputConfig`**
*   **Type:** `object`
*   **Required:** Yes
*   **Description:** Defines the input schema for the agent's task using a map of named arguments. This structure is used to generate a tool definition for the parent LLM.
*   **Schema:**
    ```typescript
    {
      inputs: {
        [argumentName: string]: {
          description: string;
          type: 'string' | 'number' | 'boolean'; // etc.
          required: boolean;
        };
      };
    }
    ```

### **`outputConfig`**
*   **Type:** `object`
*   **Required:** Yes
*   **Description:** Defines the output schema that the agent is expected to produce upon successful completion. This is enforced by the agent's runtime.
*   **Schema:**
    ```typescript
    {
      outputName: string; // The name of the argument for the complete_task tool.
      description: string; // A description of the final output.
      schema: Zod.Schema; // A Zod schema defining the structure of the output.
    }
    ```

### **`processOutput`**
*   **Type:** `(output: T) => string` (where T is the inferred type of the `outputConfig.schema`)
*   **Required:** No
*   **Description:** An optional function to format the structured output object into a final string representation for the parent agent. If not provided, a default JSON stringification is often used.

### **`promptConfig`**
*   **Type:** `object`
*   **Required:** Yes
*   **Description:** Contains the core persona and instructions for the agent's internal LLM.
*   **Schema:**
    ```typescript
    {
      // The prompt used to query the model, which can include placeholders
      // for inputs (e.g., `${objective}`).
      query: string;

      // The detailed system prompt that defines the agent's persona, rules,
      // and operational directives.
      systemPrompt: string;
    }
    ```

### **`modelConfig`**
*   **Type:** `object`
*   **Required:** No
*   **Description:** Specifies the configuration for the LLM used in the agent's internal ReAct loop.
*   **Schema:**
    ```typescript
    {
      model: string; // e.g., 'gemini-1.5-pro-latest'
      temp?: number;
      top_p?: number;
      thinkingBudget?: number; // Max tokens for thought process.
    }
    ```

### **`toolConfig`**
*   **Type:** `object`
*   **Required:** Yes
*   **Description:** Defines the set of tools available to the agent within its isolated execution environment. This allows for the creation of specialized agents with restricted, read-only, or custom capabilities.
*   **Schema:**
    ```typescript
    {
      tools: string[]; // A list of tool names to grant access to.
    }
    ```

### **`runConfig`**
*   **Type:** `object`
*   **Required:** No
*   **Description:** Defines runtime constraints to prevent runaway execution.
*   **Schema:**
    ```typescript
    {
      max_time_minutes?: number;
      max_turns?: number;
    }
    ```

---

## 4. Example: `codebase_investigator`

The following is a YAML representation of the `CodebaseInvestigatorAgent` definition, conforming to this specification.

```yaml
name: codebase_investigator
displayName: Codebase Investigator Agent
description: >
  The specialized tool for codebase analysis, architectural mapping, and 
  understanding system-wide dependencies. Invoke this tool for tasks like 
  vague requests, bug root-cause analysis, or system refactoring.

inputConfig:
  inputs:
    objective:
      description: A comprehensive and detailed description of the user's ultimate goal.
      type: string
      required: true

outputConfig:
  outputName: report
  description: The final investigation report as a JSON object.
  # In a real implementation, this would reference a defined Zod or JSON schema.
  schema: "CodebaseInvestigationReportSchema"

promptConfig:
  query: |
    Your task is to do a deep investigation of the codebase to solve for the following user objective:
    <objective>
    ${objective}
    </objective>
  systemPrompt: |
    You are **Codebase Investigator**, a hyper-specialized AI agent...
    (Full system prompt omitted for brevity)

modelConfig:
  model: "gemini-1.5-pro-latest"
  temp: 0.1
  thinkingBudget: -1

toolConfig:
  tools:
    - ls
    - read_file
    - glob
    - grep

runConfig:
  max_time_minutes: 5
  max_turns: 15
```

## 5. Runtime Considerations

A compliant runtime (e.g., the `AgentExecutor` in Gemini CLI) is responsible for:
1.  **Inflation:** Dynamically creating an isolated agentic loop based on the definition.
2.  **Tool Provisioning:** Setting up a `ToolRegistry` containing only the tools specified in `toolConfig`.
3.  **Context Management:** Initializing a `GeminiChat` instance with the persona and instructions from `promptConfig` and `modelConfig`.
4.  **I/O Marshalling:** Validating inputs against `inputConfig` and ensuring the final output conforms to `outputConfig.schema`.
5.  **Lifecycle Management:** Enforcing the constraints defined in `runConfig`.
6.  **Observability:** Streaming thoughts and actions from the sub-agent's loop to the UI or parent process for observability.

---

## 6. Protobuf Schema

The following Protobuf definition provides a formal, language-agnostic schema for the Agent Definition.

```proto
syntax = "proto3";

package gemini.agent.v1;

// The core message representing a complete agent definition.
message AgentDefinition {
  // A unique, machine-readable identifier for the agent.
  string name = 1;

  // A human-readable name for display purposes.
  string display_name = 2;

  // A detailed description of the agent's purpose and capabilities.
  string description = 3;

  // Defines the input schema for the agent's task.
  InputConfig input_config = 4;

  // Defines the output schema the agent is expected to produce.
  OutputConfig output_config = 5;

  // Contains the core persona and instructions for the agent's internal LLM.
  PromptConfig prompt_config = 6;

  // Specifies the configuration for the LLM.
  ModelConfig model_config = 7;

  // Defines the set of tools available to the agent.
  ToolConfig tool_config = 8;

  // Defines runtime constraints to prevent runaway execution.
  RunConfig run_config = 9;
}

// Defines a single input argument for the agent.
message InputArgument {
  string description = 1;
  // The data type of the argument (e.g., "string", "number").
  string type = 2;
  bool required = 3;
}

// The collection of all input arguments.
message InputConfig {
  map<string, InputArgument> inputs = 1;
}

// Defines the expected output of the agent.
message OutputConfig {
  // The name of the argument for the complete_task tool.
  string output_name = 1;
  string description = 2;
  // A string representation of the validation schema (e.g., a Zod schema as a string).
  string schema = 3;
}

// Contains the prompts that define the agent's behavior.
message PromptConfig {
  // The prompt used to query the model, which can include placeholders.
  string query = 1;
  // The detailed system prompt defining the agent's persona and rules.
  string system_prompt = 2;
}

// Configuration for the LLM used in the agent's internal loop.
message ModelConfig {
  // The model name (e.g., "gemini-1.5-pro-latest").
  string model = 1;
  optional float temperature = 2;
  optional float top_p = 3;
  // Max tokens for the thought process. -1 for unlimited.
  optional int32 thinking_budget = 4;
}

// Defines the toolset available to the agent.
message ToolConfig {
  // A list of tool names granted to the agent.
  repeated string tools = 1;
}

// Defines runtime constraints for the agent's execution.
message RunConfig {
  optional int32 max_time_minutes = 1;
  optional int32 max_turns = 2;
}
```
