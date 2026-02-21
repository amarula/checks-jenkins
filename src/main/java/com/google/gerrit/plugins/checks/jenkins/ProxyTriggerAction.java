// Copyright (C) 2022 The Android Open Source Project
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package com.google.gerrit.plugins.checks.jenkins;

import com.google.common.flogger.FluentLogger;
import com.google.gerrit.plugins.checks.jenkins.GetConfig.JenkinsChecksConfig;
import com.google.gerrit.plugins.checks.jenkins.ProxyTriggerAction.ProxyInput;
import com.google.gerrit.extensions.annotations.PluginName;
import com.google.gerrit.server.config.GerritServerConfig;
import com.google.gerrit.server.config.PluginConfigFactory;
import com.google.gerrit.server.project.ProjectResource;
import com.google.gerrit.extensions.restapi.Response;
import com.google.gerrit.extensions.restapi.RestReadView;
import com.google.gerrit.extensions.restapi.RestModifyView;
import com.google.gerrit.extensions.restapi.BadRequestException;
import com.google.gerrit.extensions.restapi.RestApiException;
import com.google.gerrit.server.project.NoSuchProjectException;
import com.google.inject.Inject;
import com.google.inject.Singleton;
import org.eclipse.jgit.lib.Config;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.time.Duration;
import java.util.stream.Collectors;

@Singleton
public class ProxyTriggerAction implements RestModifyView<ProjectResource, ProxyInput> {
  private static final FluentLogger log = FluentLogger.forEnclosingClass();
  final int CONNECTION_TIMEOUT = 30;
  private final HttpClient httpClient = HttpClient.newBuilder()
      .connectTimeout(Duration.ofSeconds(CONNECTION_TIMEOUT)).build();
  final int REQUEST_TIMEOUT = 60;
  private final PluginConfigFactory config;
  private final String pluginName;
  private static final String JENKINS_SECTION = "jenkins";
  private static final String JENKINS_URL_KEY = "url";
  private static final String JENKINS_TOKEN_KEY = "token";
  private static final String JENKINS_USER_KEY = "user";

  @Inject
  ProxyTriggerAction(PluginConfigFactory config, @PluginName String pluginName) {
    this.config = config;
    this.pluginName = pluginName;
  }

  @Override
  public Response<?> apply(ProjectResource resource, ProxyInput input)
      throws IOException, RestApiException, NoSuchProjectException, InterruptedException {
    String jenkinsName = input.jenkinsname;
    String urlPath = URLDecoder.decode(input.urlpath, StandardCharsets.UTF_8.toString());
    String method = input.method;
    String jenkinsAuth = null;
    String targetUrl = null;

    if (urlPath == null || jenkinsName == null || urlPath.isEmpty() ||
        jenkinsName.isEmpty()) {
      throw new BadRequestException("jenkinsName is required");
    }

   Config cfg = config.getProjectPluginConfig(resource.getNameKey(), pluginName);
    for (String instance : cfg.getSubsections(JENKINS_SECTION)) {
      if (instance.equals(jenkinsName)) {
        jenkinsAuth = cfg.getString(JENKINS_SECTION, instance, JENKINS_USER_KEY) + ":" +
          cfg.getString(JENKINS_SECTION, instance, JENKINS_TOKEN_KEY);
        targetUrl = cfg.getString(JENKINS_SECTION, instance, JENKINS_URL_KEY);
      }
    }

    if (jenkinsAuth == null || targetUrl == null) {
      throw new BadRequestException("Invalid configuration jenkins auth or server url missing");
    }

    String auth = Base64.getEncoder().encodeToString(jenkinsAuth.getBytes());
    String finalUrl = targetUrl + "/" + urlPath;

    HttpRequest jenkinsRequest;
    if (method == null || method.equalsIgnoreCase("GET")) {
      jenkinsRequest = HttpRequest.newBuilder()
          .uri(URI.create(finalUrl))
          .timeout(Duration.ofSeconds(REQUEST_TIMEOUT))
          .header("Authorization", "Basic " + auth)
          .GET()
          .build();
    } else if (method.equalsIgnoreCase("POST")) {
      /* Used for now only for rerun to be revisited */
      jenkinsRequest = HttpRequest.newBuilder()
          .uri(URI.create(finalUrl))
          .timeout(Duration.ofSeconds(REQUEST_TIMEOUT))
          .header("Authorization", "Basic " + auth)
          .POST(HttpRequest.BodyPublishers.noBody())
          .build();
    } else {
      throw new BadRequestException("Invalid parameters to communicate with Jenkins");
    }

    HttpResponse<String> response = httpClient.send(jenkinsRequest, HttpResponse.BodyHandlers.ofString());
    return Response.withStatusCode(response.statusCode(), response.body());
  }

  static class ProxyInput {
    public String jenkinsname;
    public String urlpath;
    public String method;
  }
}
