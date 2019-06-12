package com.naijagov.naijagov.repository;

import com.naijagov.naijagov.model.PollingUnit;

import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource
public interface PollingUnitRepository extends CrudRepository<PollingUnit, Long>{
}